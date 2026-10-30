/* Iron Canopy — (story v3) the chapters, part two: the second year of the war, Sector Four and Hollin (months 10 to
   27). Plain data read by saga.js; see saga-y1.js for the fields. */
(function (IC) {
'use strict';
const ch = c => IC.SAGA.push(c);
const res = IC.sagaRes;

ch({ id: 'C14', m: 10, t: 'A Room Made Ready', p: [
  { art: 'c14-1', cap: 'Rina brought a small box Bea had found at the workshop: a notebook of measurements, a cloth pouch, photographs of work, a packet of biscuits gone soft. The room I had kept as it was had not stayed clean.',
    says: [['ME', 'Do you want it?'], ['RINA', 'I’d like the photographs copied.'], ['ME', 'You can take them.'], ['RINA', 'I said copied.']] },
  { art: 'c14-1', cap: 'I asked whether her front room was still empty. She had put the furniture back.',
    says: [['ME', 'Already?'], ['RINA', 'I needed the room. I had made it up for her. I couldn’t keep walking past it like she was late.']] },
  { art: 'c14-2', cap: 'At the copy shop I nearly took the photographs home again. Sera was at the counter collecting the office’s order, and thought I was there for work.',
    says: [['SERA', 'I can collect the office order. You don’t need to wait for it.'], ['ME', 'It’s personal.'], ['SERA', 'Okay.']] },
  { art: 'c14-2', if: 'eve=cafe & follow=kept|resched', cap: 'On the way home I remembered a café table steadied with a folded receipt.' },
  { art: 'c14-2', if: 'eve=film & follow=kept|resched', cap: 'On the way home I remembered the ending of a film we had disagreed about. It still did not matter, and I still minded.' },
  { art: 'c14-2', if: 'eve=home & follow=kept|resched', cap: 'On the way home I remembered vegetables cut very slowly, and a plate she had started to pick up.' },
  { art: 'c14-3', cap: 'I went to Mira’s bakery at closing time and asked about the road north before I had my coat off.',
    says: [['SISTER', 'You can ask me about the road. You can’t ask me the minute you come in every time.'], ['SISTER', 'You used to ask how I was.'], ['ME', 'How are you?'], ['SISTER', 'Cross with you. And tired. And the mixer makes a noise nobody wants to hear until it stops making any noise.']] },
  { art: 'c14-3', cap: 'There were things of hers I could keep. There were also things she had been doing when I wasn’t there.' }
] });

ch({ id: 'W09', m: 11, t: 'The School Hall', p: [
  { art: 'w09', cap: 'A school hall had room for people on the form and less room when their belongings came. Halloran’s liaison said Ostrand had done its share. Mira asked whether sharing the burden meant anyone had asked the people being moved.',
    says: [['SISTER', 'They’ve moved them twice already.'], ['LIAISON', 'We have to put them somewhere.'], ['ME', 'Who has confirmed the next place can take them?']] }
], op: { sites: ['hollin', 'weir', 'ostrand'], mo: 0.5, r: 60,
  brief: 'Families from Hollin are moving south to Ostrand and Weir. Keep the road out of Hollin open, and ask for cover over the town while they go.',
  tasks: [{ k: 'road', at: 'hollin', r: 80, t: 'Keep the road out of Hollin open', keep: true },
    { k: 'ask', at: 'hollin', unit: 'shorad', h: 4, t: 'Ask for a short-range battery over Hollin' }],
  raid: { name: 'rockets on Hollin', h: [8, 24], warn: 25, intel: 'Rocket launchers on the ridge, ranged on Hollin.', hits: [{ bat: 'ra58', n: 10, at: 'city:Hollin' }] } },
after: res('W09', 'w09', 'The families moved, and nobody called the next place a home. The school still needed a plan to open again.',
  'Some families stayed in the hall a while longer. So did their complaints.',
  'We held the move rather than send families somewhere that could not take them. The delay cost them, and we said so.') });

ch({ id: 'C15', m: 12, t: 'Her Birthday', p: [
  { art: 'c15-1', cap: 'Sera’s birthday became known because someone was collecting dates for a form. June bought a cake that had been discounted because the icing was damaged, and turned the damaged side to the filing cabinet.',
    says: [['ME', 'Which way’s the front?'], ['JUNE', 'The least bad way.'], ['SERA', 'You don’t have to do this.'], ['JUNE', 'We already bought it.'], ['SERA', 'Then I suppose you’re stuck.']] },
  { art: 'c15-2', cap: 'It was orange. She disliked orange. She took a bite anyway, and it was clearly too sweet, and the room laughed, June included. Nobody’s affection has to be perfectly expressed to be real.',
    says: [['SERA', 'The cake is good.'], ['JUNE', 'You haven’t eaten it.']] },
  { art: 'c15-2', cap: 'We had bought her a thermos, because her drink always went cold before she got back to it. Someone handed me the card.',
    ask: { k: 'card', q: 'What do you write in Sera’s card?', opts: [{ v: 'glad', t: '"Glad you’re here."' }, { v: 'room', t: '"Thanks for keeping the room working."' }, { v: 'name', t: 'Only your name' }] } },
  { art: 'c15-3', cap: 'I took a piece of cake home in a folded container and ate it standing at the counter. I caught myself enjoying the sweetness before I remembered how lonely the kitchen felt. Both can exist in the same minute.' }
] });

ch({ id: 'W10', m: 12, t: 'The Parts They Promised', p: [
  { art: 'w10', cap: 'A foreman put two genuine orders on a table. One had an urgent stamp. The other had waited so long its stamp had faded. Maj. Ilse Brandt, from military logistics, asked me not to confuse an old need with a small one.',
    says: [['BRANDT', 'I can tell you which is mine. I can’t tell you the other one doesn’t matter.'], ['ME', 'What happens if yours waits?'], ['BRANDT', 'Ask me that for both.']],
    ask: { k: 'w10', q: 'Which repair goes first?', opts: [{ v: 'both', t: 'Ask what each one does, then set an order for both' }, { v: 'stamp', t: 'The urgent stamp' }] } }
], op: { sites: ['ironbridge_works', 'corbin_works', 'selby_base'], mo: 0.5, r: 50,
  brief: 'Parts for the works at Ironbridge and Corbin and for Selby Air Base. Set an honest order, and ask for cover over Ironbridge, which they have been looking at.',
  tasks: [{ k: 'pick', if: 'w10=both', t: 'Set an order for both repairs, with a fallback for the one that waits' },
    { k: 'ask', at: 'ironbridge_works', unit: 'shorad', h: 4, t: 'Ask for a short-range battery over Ironbridge Munitions' }],
  raid: { name: 'raid on Ironbridge', h: [8, 24], warn: 40, intel: 'Cruise missiles towards the works at Ironbridge.', hits: [{ bat: 'cm30', n: 3, at: 'saga:ironbridge_works' }] } },
after: res('W10', 'w10', 'The repairs gave back real capacity. The queue kept the rest.',
  'One repair reached partial service, with its limits written on it.',
  'A repair missed its window. We planned again from what was left.') });

ch({ id: 'W11', m: 13, t: 'A Night Service', p: [
  { art: 'w11', cap: 'Tomas had a small group ready long before their departure, because none of them trusted a notice that told them to come later. Sera had stayed to correct the last two entries. I told her she could go. She said she would when the replacement knew what was still open.',
    says: [['TOMAS', 'They’d rather wait here.'], ['SERA', 'Then we need to tell them which room is actually staying open.'], ['ME', 'I’ll get that confirmed.']] }
], op: { sites: ['westhaven_airport', 'westhaven_reception'], mo: 0.4, r: 50,
  brief: 'A night service out of Westhaven for people who have waited weeks. Keep the runway open and the flights going.',
  tasks: [{ k: 'open', at: 'westhaven_airport', t: 'Keep a runway open at Westhaven', keep: true }, { k: 'flights', at: 'westhaven_airport', n: 4, t: 'Land 4 flights a day at Westhaven' }],
  raid: { name: 'night raid on Westhaven', h: [10, 30], warn: 40, night: true, intel: 'Drones towards the coast after dark.', hits: [{ bat: 'dr_senitz', n: 6, at: 'saga:westhaven_airport' }] } },
after: res('W11', 'w11', 'The passengers left, or reached the shelter they were meant to. One of them thanked a member of staff I had not noticed.',
  'A departure waited, with everyone in a place we had checked.',
  'We suspended the service, kept the hall open and said why.') });

ch({ id: 'C16', m: 14, t: 'A Letter Across the Border', p: [
  { art: 'c16-1', cap: 'Kasimir Lenz, their civil liaison, sent a request through the civilian channel: displaced civilians whose movement needed clearing up. On the call his office window rattled in the wind. He moved a sheet so it would stop.',
    says: [['LENZ', 'Sorry. They’re meant to be fixing that.'], ['ME', 'Why send it before it’s complete?'], ['LENZ', 'Because one of your entries may tell us where they went. I can confirm this part. I can’t confirm the other address.']],
    ask: { k: 'lenz', q: 'The reply to Lenz:', opts: [{ v: 'window', t: 'Add a line: did they fix the window?' }, { v: 'formal', t: 'Keep it to the operational answer' }] } },
  { art: 'c16-1', cap: 'An official asked whether Lenz could use the exchange to learn our routes. It was a fair question.',
    ask: { k: 'channel', q: 'How much do you send him?', opts: [{ v: 'limited', t: 'Answer the civilian question, and nothing else' }, { v: 'review', t: 'Liaison reviews what we can release first' }] } },
  { art: 'c16-2', cap: 'A family reached the right reception point. Another stayed unconfirmed. The note of thanks was formal and correct. Below the signature, in different ink, two words: For Pavel.',
    says: [['ME', 'Who’s Pavel?'], ['APT', 'Not someone in this file. Ask him, or don’t. Don’t ask me to guess.']] },
  { art: 'c16-2', cap: 'Halloran asked for a short account of it. Her draft gave the success to me.',
    ask: { k: 'credit', q: 'The public account says it was your work.', opts: [{ v: 'team', t: 'Name the team, Lena included' }, { v: 'consent', t: 'Ask the team before naming anyone' }, { v: 'mine', t: 'Leave the flattering line' }] } },
  { art: 'c16-1', cap: 'I did not trust him. I began to trust that he would answer some questions, and say when he couldn’t. That was enough to begin.',
    says: [['LENZ', 'How is the airport operating?'], ['ME', 'Parts of it.'], ['LENZ', 'No. That was what I asked.']] }
] });

ch({ id: 'W12', m: 15, t: 'The Address That Changed', p: [
  { art: 'w12', cap: 'Lenz sent a revised reception address. A local official decided the correction proved the first request had been a trap. I could check the source instead of choosing between blind faith and closing every channel. The family involved was annoyed at both countries.',
    says: [['LENZ', 'I was wrong about the address.'], ['ME', 'What can verify this one?'], ['LENZ', 'The same question I asked them. I’ll send the answer, not just mine.'], ['ME', 'Your note. “For Pavel.”'], ['LENZ', 'My brother. He was a first officer. A long time ago, on a flight over the ridge. I sign everything that helps someone cross that border for him. Engineers are allowed one superstition.']],
    ask: { k: 'w12', q: 'The changed address:', opts: [{ v: 'verify', t: 'Verify it through the civil records, and keep a fallback moving' }, { v: 'close', t: 'Stop the transfer and close the channel' }] } }
], op: { sites: ['tarn_pass', 'elk_pass', 'westhaven_reception'], mo: 0.4, r: 60,
  brief: 'A family crossing at Tarn Pass to a changed address. Verify it, and keep the pass road open meanwhile.',
  tasks: [{ k: 'pick', if: 'w12=verify', t: 'Verify the new address through the civil records' }, { k: 'road', at: 'tarn_pass', r: 80, t: 'Keep the road at Tarn Pass open', keep: true }],
  raid: { name: 'drones at the pass', h: [8, 24], warn: 40, intel: 'Drones over the ridge, towards Tarn Pass.', hits: [{ bat: 'dr_senitz', n: 3, at: 'saga:tarn_pass' }] } },
after: res('W12', 'w12', 'The family reached the right place, and kept every right to complain.',
  'The move was delayed, with real support arranged while they waited.',
  'We stopped a transfer we could not check, and then mended the process.') });

ch({ id: 'W13', m: 16, t: 'The Rear Base', p: [
  { art: 'w13', cap: 'Col. Reyes asked for a civil slot to be released at Corbin, by the rear base at Selby. Lena had a list of people already depending on it. I asked what the base could actually support, instead of treating the south as spare room.',
    says: [['AIR', 'We can move the aircraft. We can’t move the whole day out of the way.'], ['APT', 'Neither can the people already booked on it.'], ['ME', 'Show me the capacity we’re arguing over.']] }
], op: { sites: ['selby_base', 'corbin_airport'], mo: 0.5, r: 60,
  brief: 'Military aircraft moving south to Selby, and Corbin sharing the day. Keep Corbin open with stands free for both.',
  tasks: [{ k: 'open', at: 'corbin_airport', t: 'Keep a runway open at Corbin', keep: true }, { k: 'stands', at: 'corbin_airport', n: 4, t: 'Keep 4 stands free at Corbin' },
    { k: 'flights', at: 'corbin_airport', n: 8, t: 'Land 8 flights a day at Corbin' }],
  raid: { name: 'raid on the rear base', h: [8, 24], warn: 15, intel: 'Ballistic launchers raised; Selby is in reach.', hits: [{ bat: 'mb2a', n: 3, at: 'saga:selby_base' }, { bat: 'dr_salik', n: 6, at: 'saga:selby_base', t: -300 }] } },
after: res('W13', 'w13', 'Both ran, on a reduced plan. The reduction stayed in the reports.',
  'Some work moved or waited. The people round the base stayed part of it.',
  'A service closed where the damage closed it. Nobody found a new base on paper.') });

ch({ id: 'C17', m: 17, t: 'The Petition', p: [
  { art: 'c17-1', cap: 'Rose came with a petition from staff and residents, and a comparison prepared by a local recovery liaison office. She had taken the day off, because the last request had disappeared between departments.',
    says: [['ROSE', 'I’ve tried that.'], ['ME', 'How much time have you got?'], ['ROSE', 'How much are you going to need?']] },
  { art: 'c17-2', cap: 'The request was right: the hospital district was exposed. The comparison was not. It counted the people who lived by Lowen Junction and left out everyone who worked there, passed through it, or depended on its power.',
    says: [['ME', 'These aren’t your figures.'], ['ROSE', 'Those are. The case is that we’re there. Don’t send this back to us and say the request was wrong.']],
    ask: { k: 'petition', q: 'The comparison is wrong, and the need is real.', opts: [{ v: 'public', t: 'Correct it, and say in the meeting where the error came from' }, { v: 'quiet', t: 'Correct it, without alleging intent' }, { v: 'withheld', t: 'Send it as it is. A smaller case may lose the battery.' }] } },
  { art: 'c17-3', cap: 'One extra battery for the risk period, and two places to cover. The commander would decide. My part was to say what was true and recommend.',
    says: [['CDS', 'No allocation can guarantee interception of every threat. Give me your recommendation, and the plan for the place without it.']],
    ask: { k: 'prio', q: 'Where should the extra battery go?', opts: [{ v: 'H', t: 'The hospital district: the patients and staff are there' }, { v: 'J', t: 'Lowen Junction: without it the hospital cannot run' }] } },
  { art: 'c17-1', cap: 'Lena stayed behind.',
    says: [['APT', 'Call Rose.'], ['ME', 'You said you’d come back.'], ['APT', 'I am. You made the recommendation.']] }
], fx: [{ if: 'prio=H', fx: ['unit:mrsam@east_bank'] }, { if: 'prio=J', fx: ['unit:mrsam@lowen_junction'] }] });

ch({ id: 'W14', m: 17, t: 'Before the Recommendation', p: [
  { art: 'w14', cap: 'Rose asked whether the fallback transport had actually been booked. The summary said planned. A driver was willing to help, if he knew which office was releasing the vehicle. I was being asked to finish the promise, not to be thanked for making it.',
    says: [['ROSE', 'Is it coming?'], ['ME', 'It’s in the plan.'], ['ROSE', 'That wasn’t what I asked.']] }
], op: { sites: ['east_bank', 'lowen_junction'], mo: 0.5, r: 50,
  brief: 'The risk period for East Bank and Lowen Junction. The extra battery covers one. Book the fallback for the other and keep the junction’s road open.',
  tasks: [{ k: 'ask', at: 'east_bank', h: 3, t: 'Book the fallback transport for East Bank' }, { k: 'road', at: 'lowen_junction', r: 60, t: 'Keep the road through Lowen Junction open', keep: true }],
  raid: { name: 'raid on East Bank', h: [10, 30], warn: 40, intel: 'Missiles and drones towards the east of the capital: East Bank and Lowen Junction.', hits: [{ bat: 'cm30', n: 4, at: 'saga:lowen_junction' }, { bat: 'dr_senitz', n: 6, at: 'saga:east_bank', t: -300 }] } } });

ch({ id: 'C18', m: 17.1, t: 'What It Cost', p: [
  { art: 'c18-held', if: '!W14:hit', cap: 'Lena asked what we knew, and to put the rest in another column. The attack had been held. Rose had brought a maintenance request that had been put off while everyone prepared.',
    says: [['ME', 'I thought this was covered.'], ['ROSE', 'It was covered for that night.']] },
  { art: 'c18-held', if: '!W14:hit & marit=asked', cap: 'Marit was working, and asked whether anyone had finally changed the bus notice. I greeted her by name. She knew me as the man with the notebook.' },
  { art: 'c18-junction', if: 'W14:hit:lowen_junction', cap: 'Lowen Junction had been hit. The hospital’s buildings stood and its plan did not. Rose was moving supplies while other staff arranged transfers.',
    says: [['ROSE', 'Don’t stand in the door.'], ['ME', 'Did the delay cause—'], ['APT', 'Record the delay. Don’t fill in what we don’t know.']] },
  { art: 'c18-hospital', if: 'W14:hit:east_bank', cap: 'The hospital district had been hit. Patients and staff were moving out of the rooms that could not be used. Rose said it plainly, checking a list.',
    says: [['MARIT', 'They said we could come back. Which room did they mean?']] },
  { art: 'c18-return', if: 'petition=withheld', cap: 'A reviewer found that I had known about the comparison before I sent it. Rose heard the truth.',
    says: [['ROSE', 'You were meant to tell them what we needed. I heard you. You used what would work.']] },
  { art: 'c18-return', if: 'petition=public', cap: 'Rose had had angry calls from people who heard only that her petition was wrong. I said again, to anyone who would listen, which part had been hers.' },
  { art: 'c18-return', cap: 'Days later the boy from the first visit went past with the same bag, the zip mended. After the first days, people still needed an answer about Tuesday.' }
] });

ch({ id: 'W15', m: 18, t: 'The Next Delivery', p: [
  { art: 'w15', if: '!W14:hit', cap: 'Rose handed me a new request: the maintenance that had waited while everyone prepared for the attack. She asked me to bring the right department into the room.',
    says: [['ROSE', 'Someone who can answer that without asking me to start again.']] },
  { art: 'w15', if: 'W14:hit', cap: 'Rose handed me a new request: the service the damaged route had lost. She asked me to bring the right department into the room.',
    says: [['ME', 'Who do you need here?'], ['ROSE', 'Someone who can answer that without asking me to start again.']] }
], op: { sites: ['east_bank', 'lowen_junction', 'corbin_works'], mo: 0.5, r: 50,
  brief: 'The repairs East Bank is owed. Keep the junction road open and the flights into Corbin going while the review goes on.',
  tasks: [{ k: 'road', at: 'lowen_junction', r: 60, t: 'Keep the road through Lowen Junction open', keep: true }, { k: 'flights', at: 'corbin_airport', n: 8, t: 'Land 8 flights a day at Corbin' }],
  raid: { name: 'raid on Corbin’s works', h: [10, 30], warn: 40, intel: 'Drones towards Corbin.', hits: [{ bat: 'dr_salik', n: 6, at: 'saga:corbin_works' }] } },
after: res('W15', 'w15', 'A real need was met. What the misleading paper had cost between us did not go away.',
  'A service came back in stages, with what was left of it written down.',
  'The need moved to the next window, with its people still there.') });

ch({ id: 'I2', m: 18.4, t: '22:34, the Second March', p: [
  { art: 'i2234-2', cap: 'The cell, late. At 22:34 the scanner went silent. On the weapons side Voss, who happened to be in the room, stood up. Ashe stood. Then the rest of the weapons side. June looked at me. I stood because they had.' },
  { art: 'i2234-2', cap: 'When the minute ended Voss sat down and asked for the Westhaven battery’s stock, as if she had never stopped.' }
] });

ch({ id: 'W16', m: 20, t: 'The Bridge, Again', p: [
  { art: 'w16', cap: 'The driver recognised me before I recognised him. The viaduct had new barriers, and the old delay had a new explanation. Mira was pleased it was open and tired of planning round its next closure.',
    says: [['SISTER', 'Don’t tell me it’s back to normal.'], ['ME', 'I wasn’t going to.'], ['SISTER', 'You were looking for a shorter way to say it.']] }
], op: { sites: ['tarn_viaduct', 'tarn_pass'], mo: 0.5, r: 60,
  brief: 'The Tarn Pass viaduct again. Keep the road over it open, and cover it.',
  tasks: [{ k: 'road', at: 'tarn_viaduct', r: 80, t: 'Keep the road over the viaduct open', keep: true }, { k: 'cover', at: 'tarn_viaduct', r: 160, t: 'A battery covering the viaduct' }],
  raid: { name: 'rockets on the viaduct', h: [10, 30], warn: 25, intel: 'Rocket launchers back on the ridge, ranged on the pass.', hits: [{ bat: 'ra77', n: 12, at: 'saga:tarn_viaduct' }] } },
after: res('W16', 'w16', 'What we had prepared the first time paid off, where people could see it.',
  'Some traffic kept moving while the inspections went on.',
  'The viaduct closed again. It was a different problem from the first time, and we treated it as one.') });

ch({ id: 'X2', m: 23, t: 'Sector Four', pre: ['stage:5'], p: [
  { art: 'x2-1', cap: 'The cell, late. A speaker on the weapons side played intercepted traffic, translated live by a signals officer with a flat, careful voice: a launch order from the other side of the ridge. Everyone in the room knew whose voice it was. Gen. Taras Volkan, commander of their air force.',
    says: [['VOLKAN', 'Battery Four, Senitz. Window opens at oh-two-ten. Three rounds, the harbour list, numbers two to four. Report away. Confirm the box is hot.'], ['OFFICER', 'That’s the end of every order. Every one since the war started.'], ['JUNE', 'What box?']] },
  { art: 'x2-2', cap: 'Nobody answered her. I had never heard those words before.' },
  { art: 'x2-3', cap: 'For seven weeks the harbour at Westhaven had been hit from somewhere near Senitz, the first town over Tarn Pass on their side. Col. Reyes came in with reconnaissance photographs.',
    says: [['AIR', 'We’ve found Battery Four. Two kilometres north of the town, in the cutting. Four aircraft from Fort Ashby. In and out before their radar on the ridge knows what it’s seeing.'], ['CDS', 'Give me a recommendation. Both sides of it.']] },
  { art: 'x2-4', cap: 'The short route crossed R-9, the old range over the ridge, closed to everything by treaty for thirty-four years. The long route went round it, twelve minutes more over their radar. Fort Ashby had shelters for some of its jets, not all. A Tessk airliner crossed the sector at 02:40.',
    ask: { k: 'route', q: 'Which way do the jets fly?', opts: [{ v: 'long', t: '"The long route. Not through the box."' }, { v: 'short', t: '"Through R-9. Twelve minutes less over their radar."' }] } },
  { art: 'x2-4', if: 'route=long', cap: 'Reyes did not like it, and said so.',
    says: [['AIR', 'That’s twelve minutes they can see us.'], ['ME', 'The box is closed. If we fly through it, they’ll say we opened it. They’ll be right.'], ['CDS', 'Approved. Reyes, the long route. Counter-strikes are the cell’s to recommend from tonight. In the Air room. Mind the jets you leave at home.']] },
  { art: 'x2-4', if: 'route=short', cap: 'Voss did not take long.',
    says: [['CDS', 'No. That box has been closed for thirty-four years. It stays closed while I hold this job. Go round, or don’t go.'], ['CDS', 'Reyes, the long route. Counter-strikes are the cell’s to recommend from tonight. In the Air room. Mind the jets you leave at home.']] }
], op: { sites: ['fort_ashby_base'], mo: 0.5, r: 50,
  brief: 'Recommend the strike on Battery Four from the Air room’s Counter-strike page: the north sector, the long way round. Their answer will come for the base it flies from.',
  tasks: [{ k: 'strike', t: 'Recommend a counter-strike on the batteries near Senitz' }],
  raid: { name: 'their answer', h: [16, 40], warn: 15, intel: 'Launchers raised behind the ridge. They are looking for the base the strike flew from.', hits: [{ bat: 'mb2a', n: 3, at: 'base:strike', alt: ['base:main'] }, { bat: 'dr_salik', n: 6, at: 'base:strike', alt: ['base:main'], t: -300 }] } },
after: [
  { art: 'x2-5', if: 'X2:lost', cap: 'Reyes told the cell herself. She named the pilot. She did not make a speech.',
    says: [['AIR', 'She knew the route was longer. She asked for it anyway when I told her why.']] },
  { art: 'x2-5', if: 'X2:ground', cap: 'In the morning Voss read the base’s report standing up.',
    says: [['CDS', 'Jets on the open apron. Gone. A shelter would have saved them.'], ['ME', 'I knew how many shelters there were.'], ['CDS', 'So did I. I signed it. We’ll both remember.']] },
  { art: 'x2-6', cap: 'Two days later, the civilian channel. Lenz, with the window rattling behind him.',
    says: [['LENZ', 'There were people in Senitz.'], ['ME', 'The target was two kilometres north of the town, in the cutting. If anyone in the town was hurt, I want to know.'], ['LENZ', 'Three windows. A woman cut by glass. That’s all I’ve been told.'], ['LENZ', 'Your strike went round the range. Some here think it was a message.'], ['ME', 'It was a route.'], ['LENZ', 'I know. My brother flew through that range once. It was open that night.']] }
] });

ch({ id: 'X3', m: 26, t: 'Hollin Under the Ridge', p: [
  { art: 'x3-1', cap: 'Late summer. The cell was closing Hollin’s little airfield and the road north of it to civil traffic; the old range began a few kilometres beyond the town. Mira read the notice on her phone at the bakery in East Bank, flour to the wrist. Her own shop in Hollin had been shut since the first winter.',
    says: [['SISTER', 'They’re closing the road.'], ['ME', 'For civil traffic north of the town. The town stays open.'], ['SISTER', 'The town stays open with nobody in it. I want to empty the shop. The ovens. Dad’s scales. The things I can’t buy again.'], ['SISTER', 'I don’t want a convoy slot. I want you to drive me.'], ['ME', 'When?']] },
  { art: 'x3-2', cap: 'The Tarn road, early, in Mira’s van. At a junction she took the long way round out of habit, and looked annoyed with herself.',
    says: [['ME', 'Isn’t the other way shorter?'], ['SISTER', 'Dad never drove us the north way. It was the kind of thing you don’t ask a father until he’s dead, and then there’s nobody to ask.']] },
  { art: 'x3-3', cap: 'A market town under a long grey ridge. On the ridge, far above, a white dome broken open like an egg: Station 9, the old radar of the Iron Canopy, on their side of the line since the partition. I had never been north of the ridge road. That was what I told people, and what I believed.' },
  { art: 'x3-4', cap: 'We emptied the shop. The ovens were too heavy; the scales were not. Neighbours came by, and Mira told each of them something true. Some of it was "I don’t know."',
    says: [['SISTER', 'The things I can’t buy again.']] },
  { art: 'x3-5', cap: 'On the way out she stopped by a memorial: 212 names cut in dark stone, and at one end a polished stone with nothing on it. She put a small loaf on the blank one.',
    says: [['ME', 'Who’s that one for?'], ['SISTER', 'The town couldn’t decide whether to put him on it.'], ['SISTER', 'Everybody here knows where they were the night Northline came down. I wasn’t even born. I’ve been told I remember it.']] },
  { art: 'x3-6', cap: 'I didn’t ask. Some part of me already knew there was only one answer that would make my sister leave bread there. At the viaduct the soldier at the barrier was nineteen and recognised nothing about either of us. Ana rang to ask whether we were bringing the good scales or the old ones.',
    says: [['SISTER', 'Both. They are the same scales.']] }
] });

})(window.IC);
