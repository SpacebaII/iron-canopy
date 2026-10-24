/* Iron Canopy — (the twelve acts) Part Five, the peace: Acts X to XII, after the ceasefire.
   - The ceasefire no longer ends the Career (story.js calls IC.peaceStart): the war stops, the guns go back on Hold,
     and Part Five begins. Act X, the Armistice: repair the runways, win the passengers back, open a joint corridor
     over the border, keep the guns quiet (the goals). Act XI, the Ledger: Marsh's locker, the sealed room and the
     northern half (the 'ledger' chain), a hard-liner raid under the armistice (the 'truce' chain), then what to do
     with the whole night of Northline 310 (the 'commission' chain). Act XII, the Commission: the testimony, the last
     review, and the ending (IC.endingOf: Open Sky, Two Halves or Iron Canopy; Black Morning whatever else).
   - Under the armistice, firing first breaks it (IC.peaceTick): anything our side fires that the truce card did not
     allow.
   - The Ledger: what each half says alone (IC.ledgerSays). The halves disagree until both are heard.
   Headless: it all runs in the step. */
(function (IC) {
'use strict';
const U = IC.U;
const MO = (S, n) => IC.MO(S, n);
const later = (S, dt, w, t) => IC.later(S, dt, 'castSay', S, w, t);
const conf = (S, v) => { S.story.standing = U.clamp(S.story.standing + v, 0, 100); };
const raise = (S, v) => IC.storyRaise && IC.storyRaise(S, v);
const N = S => S.world.names;
const inPart = S => S.time - S.story.actT;
const ended = (S, k) => !!(S.story.chains && S.story.chains[k] && S.story.chains[k].end);
const short = n => n.replace(/ (International|Airport|Air Base)$/, '');
const dayPax = S => Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0);
const ourAps = S => S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts && i.parts.some(p => p.kind === 'runway' && p.built));
const cratered = S => ourAps(S).reduce((n, a) => n + a.parts.filter(p => p.kind === 'runway' && p.built && p.craters && p.craters.length).length, 0);

/* the armistice's own record: when it began, the shots counted so far, the quiet since, the truce card's window */
const peaceOf = S => S.story.peace || (S.story.peace = { t: S.time, will: S.enemy ? S.enemy.will : 0, fired: S.stats.fired, quietT: S.time, okT: 0, broken: 0 });

/* ---------- the ceasefire: the war stops and Part Five begins ---------- */
IC.peaceStart = function (S, why) {
  const st = S.story, E = S.enemy;
  if (!st || st.act !== 4 || S.over) return;
  E.war = false; E.allow = new Set(); E.pending = []; E.raid = null;
  // what is in the air turns for home: nothing of theirs is still coming when the ceasefire is signed
  for (const t of S.threats) if (!t.dead && !t.d.civil && t.fromHostile) t.dead = true;
  S.ad.roe = 'hold';
  st.peace = null; peaceOf(S);
  IC.log(S, 'kill', 'CEASEFIRE', why);
  IC.flag(S, 'war', 'held');
  IC.cutscene && IC.cutscene(S, 'armistice');
  IC.storyStartAct(S, 5);
};

/* ---------- Act X's goals (Part Five's) ---------- */
IC.peaceGoals = function (S) {
  const st = S.story, P = peaceOf(S), cap = IC.cap(S), want = Math.max(2500, Math.round((st.paxPre || 0) * 0.8 / 500) * 500);
  return [
    { id: 'rebuild', text: 'Repair every runway the war cratered', check: () => !cratered(S), prog: () => `${cratered(S)} still cratered` },
    { id: 'pax', text: `Win the passengers back: ${want.toLocaleString('en-US')} a day`, ref: cap, check: () => dayPax(S) >= want, prog: () => `${Math.round(dayPax(S)).toLocaleString('en-US')} today` },
    { id: 'corridor', text: `Open the joint corridor: an airway to an entry point on the ${N(S).A} border`, check: () => corridorOpen(S) },
    { id: 'quiet', text: 'Keep the guns quiet for three months: the armistice holds while nobody fires', check: () => S.time - P.quietT >= MO(S, 3), prog: () => `${U.months(S.time - P.quietT)} quiet` }
  ];
};
/* an airway that ends at an entry point within 40 km of the hostile border */
function corridorOpen(S) {
  const F = new Map(S.asp.fixes.map(f => [f.id, f]));
  return S.asp.ways.some(w => [w.a, w.b].some(id => { const f = F.get(id); return f && f.gate && IC.hostileBorderDist(f.x, f.y) < 400; }));
}
IC.peaceCorridor = corridorOpen;

/* ---------- which act of Part Five ---------- */
IC.peacePartWant = function (S) {
  if (ended(S, 'commission') || beatOn(S, 'testimony')) return 12;
  if (ended(S, 'ledger') || inPart(S) > MO(S, 10)) return 11;
  return 10;
};
const beatOn = (S, id) => { const b = (S.story.beats || []).find(x => x.id === id); return !!(b && b.done); };

/* ---------- Part Five's beats ---------- */
IC.peaceBeats = function (S) {
  const st = S.story, B = [];
  B.push({ id: 'joint', gap: [1800, 3600], run: () => {
    IC.say(S, 'ATC', `Ivo Marsh. The armistice wants a joint sector over the ridge: their controllers and ours in one room. I have asked to work it myself. I owe that sector something.`);
    if (IC.flagOf(S, 'corridor') === 'friend') later(S, 3 * 3600, 'LENZ', `Kasimir. I am allowed to telephone you now, which is strange. I am going up to the ruins of Station 9 next week with the clearance teams. My brother's airliner came down a few kilometres from there.`);
  } });
  B.push({ id: 'stone', need: () => inPart(S) > MO(S, 2), gap: [3600, 7200], run: () => {
    if (IC.flagOf(S, 'mira') === 'lost') IC.say(S, 'GOV', `Anja Tessel. Ana asked me to tell you: the town has put Mira's name on the memorial, under the 212. The blank stone is still blank. She says you will know why.`);
    else IC.say(S, 'SISTER', `Mira. I took Ana to the memorial. The blank stone is for the controller, Director. The one the town blamed. It was Dad. Emil. They could not carve his name and they could not leave him out. I have known since I was twelve.`);
    later(S, 2 * 3600, 'YOU', `I had not known. Or I had decided, a long time before, not to.`);
  } });
  B.push({ id: 'testimony', need: () => ended(S, 'commission') && inPart(S) > MO(S, 1), gap: [MO(S, 0.5), MO(S, 1)], run: () => testimony(S) });
  B.push({ id: 'end', need: () => (beatOn(S, 'testimony') && S.time - beatT(S, 'testimony') > MO(S, 3)) || inPart(S) > MO(S, 36), gap: [3600, 7200], run: () => finish(S) });
  return B;
};
const beatT = (S, id) => { const b = S.story.beats.find(x => x.id === id); return b && b.at != null ? b.at : S.time; };

/* Act XII opens: the testimony, and what is read on their air */
function testimony(S) {
  const to = IC.flagOf(S, 'ledgerTo'), whole = ledger(S).north && ledger(S).south;
  IC.cutscene && IC.cutscene(S, 'commission');
  IC.say(S, 'PM', to === 'sealed' ? `The hearing is closed, Director. One stenographer. Say what you have to say, and then we will all go home and never say it again.` : `They have put Volkan and me in the same room tomorrow. Thirty-four years. I do not know what I will say to him. I know what I said to him then.`);
  later(S, 4 * 3600, 'KOLAR', to === 'joint' && whole ? `Tonight I will read you something I have not read before: the whole night of Northline 310, both rooms, both tapes. Nobody did it alone. I am sorry it took us thirty-four years. Good evening.` : `${33 + IC.calAt(S, S.time).y} years ago, on the Black Morning, the ${N(S).H} sent an airliner full of its own people into our missiles. We remember the 212. Good evening.`);
}
/* the Career's end: the Commission reports, the last review, the ending */
function finish(S) {
  if (S.over) return;
  const to = IC.flagOf(S, 'ledgerTo');
  IC.victory(S, to === 'joint' ? 'The Northline Commission has reported. The peace holds.' : to === 'public' ? 'The Ledger is public. The peace holds, cold.' : to === 'sealed' ? 'The Ledger is sealed again. The peace holds, for now.' : `The peace with the ${S.world.full.A} holds.`);
}

/* ---------- the armistice: firing first breaks it ---------- */
IC.peaceTick = function (S, dt) {
  const st = S.story; if (!st || st.act !== 5 || !st.peace) return;
  const P = st.peace;
  if (S.stats.fired === P.fired) return;
  P.fired = S.stats.fired; P.quietT = S.time;
  if (S.time < P.okT) return;   // the truce card allowed it: shooting down what crossed, over our own ground
  P.broken++;
  IC.flag(S, 'armistice', 'broken');
  conf(S, -12); raise(S, 6);
  if (S.enemy) S.enemy.will = Math.min(100, S.enemy.will + 10);
  IC.castTrust(S, 'PM', -8, 'the armistice'); IC.castTrust(S, 'ENVOY', -6, 'the armistice');
  IC.news(S, `ARMISTICE BROKEN? The ${N(S).H} fired first over the border, the ${S.world.full.A} says. The joint commission meets tonight.`);
  IC.say(S, 'PM', P.broken > 1 ? `Again, Director. Every shot we fire is a speech for their hard-liners.` : `Who fired? Under the armistice nothing fires unless they fire first. Their hard-liners will be dancing.`);
};

/* ---------- the Ledger: the night of Northline 310, in two halves ---------- */
const ledger = S => S.story.ledger || (S.story.ledger = { south: false, room: false, north: false });
IC.ledger = ledger;
/* what the Ledger says, from the halves we have heard */
IC.ledgerSays = function (S) {
  const L = ledger(S);
  if (L.south && L.north) return `Nobody did it alone. A drone exercise cancelled at 22:10${L.room ? ', and nobody told the computer' : ''}. A storm. A turn cleared on a word: the range is cold. A track the computer kept. Then a question from their battery, and four words from our liaison officer answering a different one: the box is hot.`;
  if (L.south) return `Their battery shot down an airliner on a cleared turn, without a word of warning.${L.room ? ' The drone it should have been was cancelled at 22:10, and nobody told the computer.' : ''}`;
  if (L.north) return 'A southern officer confirmed the target: "the box is hot". The battery only did as it was told.';
  return 'Nobody has heard either half.';
};

const PEACE_CHAINS = ['ledger', 'truce', 'commission'];
Object.assign(IC.CHAINS, {
  /* Act X into XI: Marsh's locker, the sealed room, and the northern half */
  ledger: { name: 'The Ledger', who: 'ATC', core: true, first: 'locker',
    steps: {
      locker: { place: 'area_centre', act: [5, 5], when: S => inPart(S) > MO(S, 1),
        card: S => ({ title: 'Ivo Marsh\'s locker', text: `Ivo Marsh puts a tape box on your desk, and his hand on it. "I was the trainee, Director. I sat beside your father that night. This is our room's tape, all of it, not the copy Varga had: it does not stop at 22:33. And the Minister has a key to a room in the old Area Centre that nobody has opened since. Petra Halloran is afraid of what is in it. She should be."`,
          opts: [
            { t: 'Take it, and ask Halloran for the key', tip: 'The sealed room is opened: what it holds goes in the Ledger.', risk: 'Halloran gives you the key the way someone hands over a grenade.', trust: { ATC: 8, MIN: -8 }, fx: S => { const L = ledger(S); L.south = true; L.room = true; later(S, 3 * 3600, 'MIN', `Here is the key. The room's log is on the desk where they left it. One line: "drone exercise cancelled 22:10, battery informed". Nothing about the computer. I am told it never cleared a cancelled track. Do not tell me who you tell.`); }, set: { locker: 'room' }, next: 'north', mo: 2 },
            { t: 'Take the tape, leave the room shut', tip: 'The Ledger has our half. Halloran is grateful.', risk: 'Whatever is in that room stays the Ministry\'s secret.', trust: { ATC: 4, MIN: 6 }, fx: S => { ledger(S).south = true; }, set: { locker: 'tape' }, next: 'north', mo: 2 }
          ] }) },
      north: { place: ['station9', 'crash310'], act: [5, 5], when: S => ended(S, 'truce') || inPart(S) > MO(S, 5),
        card: S => {
          const f = IC.flagOf(S, 'corridor');
          if (f === 'arrested') return { title: 'The northern half', text: `Their half of the night is in their archive, or in the ruins of Station 9. Kasimir Lenz, who might have found it, is in one of their prisons; you put him there. Their envoy to the joint commission says it can be asked for "under the articles of the armistice", in a tone that says what asking will cost.`,
            opts: [
              { t: 'Hear our half alone, carefully', tip: 'The Ledger stays one-sided: it blames their battery.', risk: 'Half the truth told as the whole is how this started.', trust: { ATC: -4, PM: 4 }, set: { north: 'none' }, end: 'half' },
              { t: 'Demand their half under the armistice', tip: 'Tension +6. Their half comes, months late and unsigned.', risk: 'Their hard-liners will say we are reopening the war by other means.', trust: { LEADER: -10, ATC: 6 }, heat: 1, fx: S => { raise(S, 6); ledger(S).north = true; heard(S); }, set: { north: 'demanded' }, end: 'whole' }
            ] };
          return { title: 'The northern half', text: f === 'friend' ? `Kasimir Lenz rings from the ridge. "Station 9's battery room. The tape deck was under a collapsed ceiling, the reel still on it. Their half, Director: the battery's own line. I have listened to the first minute and I cannot listen to the rest alone. Will you hear it with me?"` : `A parcel at the ministry, no letter, a northern postmark: a reel of tape labelled STATION 9, 14.03, BTY LINE. Ivo Marsh holds it up to the light and says nothing for a long time. "That is their battery's line," he says. "If we play it next to ours, we will hear the whole night."`,
            opts: [
              { t: 'Hear both halves side by side', tip: 'The whole night is heard for the first time. It changes whom the Ledger blames.', risk: 'Some of the people who lived inside the old story are still in office. One of them is your Prime Minister.', trust: { ATC: 8, LENZ: 8, PM: -6 }, fx: S => { ledger(S).north = true; heard(S); }, set: { north: 'heard' }, end: 'whole' },
              { t: 'Leave their half where it is', tip: 'Nothing changes. The Ledger keeps blaming their battery.', risk: 'It is evidence. Someone else will play it one day, without you.', trust: { ATC: -8, PM: 6, LENZ: -6 }, set: { north: 'left' }, end: 'half' }
            ] };
        } }
    },
    ends: {
      whole: { did: S => 'You heard both halves of the Northline tapes side by side.', came: S => 'For the first time anybody could hear the whole night: no one person did it.' },
      half: { did: S => 'You kept to our half of the Northline tapes.', came: S => 'The Ledger went on blaming their battery, as it always had.' }
    } },

  /* Act XI: hard-liners across the border try to break the truce */
  truce: { name: 'The truce', who: 'CDS', core: true, first: 'raid',
    steps: {
      raid: { act: [5, 5], when: S => inPart(S) > MO(S, 3),
        card: S => { const t = IC.storyBorderTown(S), tn = t ? t.name : 'the border towns';
          return { title: 'Drones under the armistice', text: `"Four drones off their side of the ridge, heading for ${tn}," General Voss says. "Their government swears it is not them: hard-liners, an air force unit that never accepted the ceasefire. Under the armistice we do not fire unless they fire first. A drone is a kind of first. You have a minute."`,
            opts: [
              { t: 'Tell their side, then shoot them down over ours', tip: 'Weapons free for an hour over our ground only. The armistice holds if nothing we fire crosses the border.', risk: 'A missile that misses keeps flying. North.', trust: { CDS: 4, ENVOY: 4 }, fx: S => armTruce(S, t), set: { truce: 'told' }, end: 'told' },
              { t: 'Hold fire and let the world see', tip: `The drones hit ${tn}. Confidence −6; their hard-liners are blamed, abroad and at home.`, risk: 'People will die so that a point can be made.', trust: { CDS: -8, ENVOY: 8, LEADER: 6 }, fx: S => { conf(S, -6); if (S.enemy) S.enemy.will = Math.max(0, S.enemy.will - 8); IC.enemyForceOp(S, 'drones', t ? { x: t.x, y: t.y, name: t.name } : null, { n: 4 }); later(S, 7200, 'ENVOY', `Clare Whitlow. Their government has arrested the officers who sent the drones. You looked weak for a day. You will look patient for years.`); }, set: { truce: 'held' }, end: 'held' },
              { t: 'Strike the launch site', tip: 'It never happens again from there. The armistice is broken.', risk: 'This is what the hard-liners wanted: a reason.', trust: { CDS: 10, PM: -10, ENVOY: -10 }, heat: 2, fx: S => { IC.flag(S, 'armistice', 'broken'); conf(S, -4); raise(S, 10); if (S.enemy) S.enemy.will = Math.min(100, S.enemy.will + 15); IC.news(S, `STRIKE ACROSS THE RIDGE: the ${N(S).H} hits a drone base inside the ${S.world.full.A}. The armistice commission suspends its sitting.`); }, set: { truce: 'struck' }, end: 'struck' }
            ] }; } }
    },
    ends: {
      told: { did: S => 'When hard-liners sent drones under the armistice, you told their side and shot them down over ours.', came: S => IC.flagOf(S, 'armistice') === 'broken' ? 'Something we fired crossed the ridge anyway, and the truce frayed.' : 'Their government thanked us, quietly. The truce held.' },
      held: { did: S => 'When hard-liners sent drones under the armistice, you held fire.', came: S => 'The drones hit the border town. The officers who sent them were arrested by their own side.' },
      struck: { did: S => 'When hard-liners sent drones under the armistice, you struck their launch site.', came: S => 'It never fired again. Neither did the joint commission, for a year.' }
    } },

  /* Act XI's end: what to do with the whole night */
  commission: { name: 'The Commission', who: 'PM', core: true, first: 'choose',
    steps: {
      choose: { act: [5, 5], when: S => ended(S, 'ledger') && (S.story.part || 0) >= 11,
        card: S => {
          const whole = ledger(S).south && ledger(S).north;
          return { title: 'The Ledger', text: `The Prime Minister reads the Ledger in your office with the door shut. It says: ${IC.ledgerSays(S)} He is quiet for a long time. "I was the liaison officer," Oren Valk says. "I said the box was hot. I was answering a question about the storm." Then: "It is yours to decide. I cannot."${whole ? '' : ' (It holds only one half of the night.)'}`,
            opts: [
              { t: 'Give it to a joint commission', tip: whole ? `Both countries hear it together, in public, with both flags behind the table.${S.story.r9 ? ' The old range over the ridge, R-9, is withdrawn.' : ''}` : 'The commission hears only our half; their side will read it as blame.', risk: 'The Prime Minister will testify. He may not survive it in office.', trust: { PM: -6, LENZ: 8, ENVOY: -6, ATC: 8 }, set: { ledgerTo: 'joint' }, fx: S => { if (whole) IC.storyRidgeOpen(S); }, end: 'joint' },
              { t: 'Release it to the public', tip: 'Confidence +6. The Courier prints it all on Saturday.', risk: 'Each country will read the half it wants.', trust: { PRESS: 12, PM: -12, LEADER: -8 }, fx: S => { conf(S, 6); raise(S, 4); IC.storyPaper && IC.storyPaper(S, 'THE LEDGER', 'Northline 310: the whole night, in both rooms', IC.ledgerSays(S), 'Prime Minister Valk has not commented.'); }, set: { ledgerTo: 'public' }, end: 'public' },
              { t: 'Seal it again', tip: 'The Prime Minister +10. Nothing changes.', risk: 'You will know. So will Marsh, and Lenz, and whoever is listening to you now.', trust: { PM: 10, PRESS: -12, ATC: -10, LENZ: -8 }, set: { ledgerTo: 'sealed' }, end: 'sealed' }
            ] };
        } }
    },
    ends: {
      joint: { did: S => 'You gave the Northline Ledger to a joint commission.', came: S => ledger(S).north ? 'Both countries heard it together. The corridor over the ridge was renamed Northline 310.' : 'It heard only our half, and their side heard blame.' },
      public: { did: S => 'You released the Northline Ledger to the public.', came: S => 'Each country read the half it wanted. The peace held, cold.' },
      sealed: { did: S => 'You sealed the Northline Ledger again.', came: S => 'The blank stone stayed blank.' }
    } }
});
for (const k of PEACE_CHAINS) IC.chainRegister(k);
if (IC.LORE_CHAINS) IC.LORE_CHAINS.push(...PEACE_CHAINS);

/* the truce card's first answer: weapons free over our own ground for an hour, and the drones come */
function armTruce(S, t) {
  const P = S.story.peace; if (!P) return;
  P.okT = S.time + 3600;
  S.ad.roe = 'tight';
  IC.later(S, 3600, 'peaceHold', S);
  IC.enemyForceOp(S, 'drones', t ? { x: t.x, y: t.y, name: t.name } : null, { n: 4 });
}
IC.H.peaceHold = S => () => { if (S.story && S.story.act === 5) S.ad.roe = 'hold'; };

/* the whole night heard: the narrator corrects what they said before (Acts I and VIII) */
function heard(S) {
  IC.cutscene && IC.cutscene(S, 'ledger');
  later(S, 1800, 'YOU', `I told you that the first time I went north for the airport, I had not been north of the capital in thirty years. I was born there. We left when I was four, the spring after Northline 310.`);
  later(S, 5400, 'YOU', `I told you I had never heard "the box is hot" before the war. That was not true either. My father said it in his sleep, for as long as I lived in his house.`);
}

/* ---------- the cutscenes of Part Five ---------- */
const listener = S => IC.flagOf(S, 'mira') === 'lost' ? 'mira' : IC.flagOf(S, 'corridor') === 'friend' ? 'lenz' : 'none';
Object.assign(IC.CUTSCENES, {
  armistice: { title: 'The armistice', panels: [
    { art: 'arm-1', src: '3d', shot: 'Dawn over a quiet airfield with craters along the runway, engineers\' lorries beside them, an airliner parked untouched at a stand.', cap: 'The ceasefire came on a Tuesday. The engineers were on the runways before the radio had finished saying so.' },
    { art: 'arm-2', src: 'ai', shot: 'A long table in a border customs hall, two delegations facing each other, two small flags, a map of the ridge between them.', cap: 'They signed it in a customs hall on the ridge road. Nobody shook hands for the cameras.', say: ['PM', 'It is not peace. It is a promise to try.'] }
  ] },
  ledger: { title: 'Four words', panels: [
    { art: 'led-1', src: 'ai', shot: 'Two old reel-to-reel tape decks side by side on a table in a dark room, both turning, one cable to one pair of headphones.', cap: 'We played them together, our room and their battery, minute by minute. Marsh kept the time with a pencil.' },
    { art: 'led-2', src: 'ai', shot: 'A close-up of a pencil on a log sheet, the time 22:33 written and circled, an old man\'s hand holding it.', cap: 'At 22:33 their battery asked if the track was the exercise. At the same second, on another line, someone asked us about the storm.' },
    { art: 'led-3', src: 'ai', shot: 'The Director alone at the table, headphones in hand, the two decks stopped, a window of grey light behind.', cap: 'And our liaison officer answered the question he had been asked. Four words. Each side has been playing half of them for thirty-four years.', say: ['ATC', 'He was answering about the storm. I heard him. I have always heard him.'] }
  ] },
  commission: { title: 'The testimony', panels: [
    { art: 'com-1', src: 'ai', shot: 'A plain room with one microphone on a table, a glass of water, the Director seen from behind facing a row of listeners.', cap: 'Everything I have told you, I have told you in this room. You knew that, I think.' },
    { art: 'com-2', src: 'ai', shot: 'Two old men in a corridor, one in a southern suit, one in a northern uniform without insignia, standing a metre apart, neither offering a hand.', cap: 'Valk and Volkan met in the corridor outside. They stood a metre apart for a minute. Then Volkan said something I did not hear, and Valk nodded.' }
  ] },
  endSky: { title: 'The Open Sky', pick: S => listener(S), panels: [
    { art: 'endS-1', src: 'ai', shot: 'A public hearing hall, both countries\' flags behind a long table, the Director at a microphone, a full gallery.', cap: 'The Northline Commission sat in public, with both flags behind the table. I was the last witness.' },
    { art: 'endS-2', src: '3d', shot: 'An airliner climbing over the northern ridge at dawn on a published airway, the ruined radar dome below it.', cap: 'The corridor over the ridge has a name now. Every flight that crosses it is Northline 310 for a few minutes.' },
    { art: 'endS-3', src: 'ai', shot: 'The memorial on the market square, the blank stone carved at last with a name, a woman and a teenage girl laying flowers.', cap: 'They carved the blank stone. Emil, controller. Under it, in smaller letters, everyone who was in a room that night and lived.', only: 'none' },
    { art: 'endS-3l', src: 'ai', shot: 'The memorial on the market square, the blank stone carved at last, a grey-haired man (Lenz) standing beside the Director in the rain.', cap: 'They carved the blank stone. Kasimir came south for it, and stood beside me in the rain, and said his brother would have liked my father.', only: 'lenz' },
    { art: 'endS-3m', src: 'ai', shot: 'The memorial on the market square, two carved stones side by side, a young woman in a controller\'s uniform (Ana) touching the second one.', cap: 'They carved the blank stone, and Mira\'s beside it. Ana put the flowers down for both.', only: 'mira' },
    { art: 'endS-4', src: 'ai', shot: 'The hearing room, emptying; a single listener left in the front row looking up at the Director.', cap: 'When I had finished, nobody moved for a while. Then someone in the front row leaned forward. "Go on. What happened next?"', say: ['YOU', 'That is all of it.'] }
  ] },
  endHalves: { title: 'Two Halves', pick: S => listener(S), panels: [
    { art: 'endH-1', src: 'ai', shot: 'The commission\'s hall with half its chairs empty, one country\'s flag behind the table and an empty pole beside it.', cap: 'Half the seats were empty. Their side sent a statement instead of a delegation.' },
    { art: 'endH-2', src: 'ai', shot: 'Two newspapers on two kitchen tables in two countries, the same photograph of an airliner, opposite headlines.', cap: 'Each country read the half it wanted. Their papers said we had admitted it. Ours said they had.' },
    { art: 'endH-3', src: '3d', shot: 'Two fighters on a quiet patrol line along the ridge at dusk, a long way apart.', cap: 'The peace holds. It is the cold kind. The fighters still fly the ridge, a long way apart.' },
    { art: 'endH-4', src: 'ai', shot: 'A kitchen table at night, a young woman (Ana) across from the Director, a printed Ledger between them.', cap: 'Ana read it all, both halves, in one night.', only: 'mira', say: ['YOU', 'Go on, then. Ask.'] }
  ] },
  endCanopy: { title: 'The Iron Canopy', pick: S => listener(S), panels: [
    { art: 'endC-1', src: 'ai', shot: 'A small windowless ministry room, one stenographer at a typewriter, the Director facing a single official across a bare table.', cap: 'The hearing was closed. One stenographer. When I finished, she was told to stop typing, and she had already stopped.' },
    { art: 'endC-2', src: 'ai', shot: 'A filing box with a red seal being placed on a shelf among many others in a dim archive.', cap: 'The Ledger went back on its shelf. The blank stone stayed blank.' },
    { art: 'endC-3', src: '3d', shot: 'A new radar and missile battery on the ridge at night, a drone on a launch rail, a screen with a track number.', cap: 'Last spring there was an exercise on the ridge. A new drone, a new computer. I asked what track number they had given it. Nobody would tell me.' }
  ] }
});
Object.assign(IC.ENDINGS, {
  sky: { title: 'The Open Sky', text: S => `The Northline Commission heard the whole night in public, and the peace with the ${S.world.full.A} became something more than a promise. The corridor over the ridge carries both countries' airliners, and a name.` },
  halves: { title: 'Two Halves', text: S => `The Ledger was read, in half. The peace with the ${S.world.full.A} holds, cold, and each side remembers the night its own way.` },
  canopy: { title: 'The Iron Canopy', text: S => `The Ledger was sealed again. The peace holds, for now, under the same sky and the same silence.` }
});

})(window.IC);
