/* Iron Canopy — (story v3) the chapters, part three: the third winter to the hostage event and its answer (months
   28 to 42). Plain data read by saga.js; see saga-y1.js for the fields. */
(function (IC) {
'use strict';
const ch = c => IC.SAGA.push(c);
const res = IC.sagaRes;

ch({ id: 'C19', m: 28, t: 'Winter Work', p: [
  { art: 'c19-1', cap: 'The third winter of the war. The office heater failed and its replacement tripped a circuit elsewhere, so we worked in coats. Sera arrived with the thermos from her birthday.',
    says: [['SERA', 'This might be the best thing anyone’s bought me.'], ['JUNE', 'You said you were returning it.'], ['SERA', 'I was being polite.']] },
  { art: 'c19-2', cap: 'The channel with Lenz cleared another transport problem: older passengers, luggage, a bus sent to the wrong side of a town. At the reception point a man insisted on paying for tea, left coins on the table, and complained about how weak it was.',
    says: [['SERA', 'He wrote a complaint before he sat down.'], ['ME', 'About us?'], ['SERA', 'About the tea.']] },
  { art: 'c19-3', cap: 'Mira had put up the price of one ordinary loaf. A regular customer accused her of profiting from the war. I started to step in. She gave me a look and handled it herself.',
    says: [['ME', 'I could have paid.'], ['SISTER', 'You don’t know what he needed. You heard him shout. If you want to pay for the office order, you can start with that.']] },
  { art: 'c19-3', if: 'june=abrupt', cap: 'June had taken to asking Sera what she could have asked me.',
    says: [['ME', 'You could have asked me.'], ['JUNE', 'You said it was done.'], ['ME', 'I meant that question. I was short with you. You can still ask.'], ['JUNE', 'Okay.']] },
  { art: 'c19-4', if: 'ivo!=public', cap: 'Ivo asked whether I wanted to come over for a meal.',
    ask: { k: 'meal', q: 'Ivo’s invitation:', opts: [{ v: 'stay', t: 'Go, and stay for the meal' }, { v: 'decline', t: '"I’m tired. I won’t be very good company."' }] } },
  { art: 'c19-4', if: 'meal=stay', cap: 'He insisted he did not need help and then could not find the right lid. I found it in the cupboard he said was empty. When I asked where he wanted the bag, he named the chair beside him.' },
  { art: 'c19-4', if: 'meal=decline', cap: 'He took it as it was meant.',
    says: [['ATC', 'Then don’t make a performance of it. Another time.']] },
  { art: 'c19-dish', if: 'gift=dish', cap: 'At home the blue dish took my keys with the small sound it had made when Nadia first used it.' },
  { art: 'c19-book-no-ticket', if: 'gift=book', cap: 'The book opened at the page someone had hated. I remembered Nadia explaining why.' },
  { art: 'c19-prints', if: 'gift=prints', cap: 'The prints hung in the order she had chosen, not the order I had first assumed.' },
  { art: 'c19-dish', cap: 'Mira sent a message about the bakery order and the empty containers.',
    ask: { k: 'mira', q: 'Mira’s message:', opts: [{ v: 'now', t: 'Call her now' }, { v: 'later', t: 'Give her a time, and keep it' }, { v: 'sit', t: 'Let it sit' }] } },
  { art: 'c19-1', cap: 'By winter there were things I no longer checked, because I knew who had done them. Some of that was how an office learned to work.' }
] });

ch({ id: 'W17', m: 30, t: 'Third Winter', p: [
  { art: 'w17', if: 'mira!=sit', cap: 'Mira rang about an order.',
    says: [['SISTER', 'I asked how many.'], ['ME', 'Twelve. And I need the receipt.'], ['SISTER', 'Look at you.']] },
  { art: 'w17', if: 'mira=sit', cap: 'Mira rang about an order.',
    says: [['SISTER', 'Should I still put these aside for you?'], ['ME', 'Yes. Twelve. Thank you.']] },
  { art: 'w17', cap: 'On the next work call an official asked me to record a restoration estimate as confirmed. A better answer to my sister did not settle that.' }
], op: { sites: ['kessock_power', 'ashford_power', 'hollin'], mo: 0.5, r: 50,
  brief: 'The third winter, with the repairs of two winters still owed. Cover the power stations and keep Hollin’s road open.',
  tasks: [{ k: 'cover', at: 'kessock_power', r: 160, t: 'A battery covering Kessock Power Station' }, { k: 'cover', at: 'ashford_power', r: 160, t: 'A battery covering Ashford Power Station' },
    { k: 'road', at: 'hollin', r: 80, t: 'Keep the road to Hollin open', keep: true }],
  raid: { name: 'winter raid on power', h: [8, 24], warn: 40, intel: 'Cruise missiles and drones: their targets are the power stations.', hits: [{ bat: 'cm30', n: 4, at: 'saga:kessock_power' }, { bat: 'dr_senitz', n: 6, at: 'saga:ashford_power', t: -300 }] } },
after: res('W17', 'w17', 'The cold weeks were managed with fewer false promises. People were still tired.',
  'Some districts stayed limited, with a plan that went on supporting them.',
  'We moved services, or cut them, and said so.') });

ch({ id: 'I3', m: 30.4, t: '22:34, the Third March', p: [
  { art: 'i2234-3', cap: 'At home, at 22:35, my phone rang. Ivo.',
    says: [['ATC', 'Did I wake you?'], ['ME', 'No.'], ['ATC', 'Good.'], ['ATC', 'That’s all. Go to sleep.']] },
  { art: 'i2234-3', cap: 'He hung up. I looked at the time and did not understand it until much later.' }
] });

ch({ id: 'W18', m: 31, t: 'What a Shift Costs', p: [
  { art: 'w18', cap: 'A foreman refused another unofficial extra shift. I heard obstruction, because an important field was waiting. Lena asked me when that worker had last gone home on time. I did not know.',
    says: [['FOREMAN', 'They’re not refusing the work. They’re refusing another promise about when it ends.'], ['ME', 'We need the repair.'], ['FOREMAN', 'I know. I also need the person doing it to come back tomorrow.']],
    ask: { k: 'w18', q: 'The repair queue:', opts: [{ v: 'honest', t: 'Rebuild it round the staff there are, with a reduced service meanwhile' }, { v: 'push', t: 'Ask for one more shift' }] } }
], op: { sites: ['ironbridge_works', 'corbin_works', 'arden_yard'], mo: 0.5, r: 50,
  brief: 'Repairs at Ironbridge and Corbin with tired crews. Set a schedule people can keep, and keep Corbin’s flights going on a reduced plan.',
  tasks: [{ k: 'pick', if: 'w18=honest', t: 'A repair schedule the crews can keep' }, { k: 'flights', at: 'corbin_airport', n: 6, t: 'Land 6 flights a day at Corbin' }],
  raid: { name: 'raid on Ironbridge', h: [8, 24], warn: 40, intel: 'Cruise missiles towards Ironbridge.', hits: [{ bat: 'cm30', n: 3, at: 'saga:ironbridge_works' }] } },
after: res('W18', 'w18', 'The schedule was believable and the work started again. The queue was still finite.',
  'A reduced plan held while the demand stayed.',
  'A repair stayed undone. We wrote down the limit, and did not blame the people who were too tired to do it.') });

ch({ id: 'W19', m: 32, t: 'The Empty Wagon', p: [
  { art: 'w19', cap: 'A manifest said a consignment had left the coast. The receiver said it never arrived. Sera kept the family enquiries moving while I checked. A clerk offered me a convenient name.',
    says: [['ME', 'Who saw it leave?'], ['CLERK', 'It’s signed.'], ['ME', 'That tells me who signed. Who saw it?']],
    ask: { k: 'w19', q: 'The clerk has a name ready.', opts: [{ v: 'check', t: 'Check every handover first' }, { v: 'name', t: 'Report the name' }] } }
], op: { sites: ['westhaven_port', 'corbin_works', 'arden_yard'], mo: 0.4, r: 50,
  brief: 'A missing consignment from Westhaven. Check the handovers, and keep the harbour covered.',
  tasks: [{ k: 'pick', if: 'w19=check', t: 'Check each handover against the people who saw it' }, { k: 'cover', at: 'westhaven_port', r: 160, t: 'A battery covering Westhaven harbour' }],
  raid: { name: 'drones on the harbour', h: [8, 24], warn: 40, intel: 'Drones towards the coast.', hits: [{ bat: 'dr_senitz', n: 6, at: 'saga:westhaven_port' }] } },
after: res('W19', 'w19', 'We found the consignment, or an honest reason for it. The chain of evidence held.',
  'Some of it turned up. The rest of the need stayed.',
  'It stayed missing. Picking a suspect did not make us certain.') });

ch({ id: 'C20', m: 33, t: 'The Missing Explanation', p: [
  { art: 'c20-1', cap: 'A procurement clerk brought me three records that could not all describe the same work honestly: Arden’s milestone report, the installation record, and an internal note on why the gap had been accepted for payment.',
    says: [['CLERK', 'I don’t want you calling it theft before somebody reads it.'], ['ME', 'What do you call it?'], ['CLERK', 'That’s why I brought the third one.']] },
  { art: 'c20-1', cap: 'With Lena and a reviewer we checked the originals. Summaries had overstated readiness. The exceptions had been known inside the administration. A warning that the summaries could mislead planning had reached Halloran’s office before the strike. The liaison office that had written Rose’s comparison had been funded by Arden.' },
  { art: 'c20-2', cap: 'Halloran asked to see me when she heard. I took Lena.',
    says: [['MIN', 'We knew there were outstanding installations. We had assurances.'], ['ME', 'Then why call them ready?'], ['MIN', 'Because if the contract failed at that point, we lost more than the outstanding installations.'], ['ME', 'Did you think anyone would read the green boxes as green boxes?'], ['MIN', 'I should have made sure they couldn’t.'], ['ME', 'You helped me get a corrected form because someone couldn’t put the truth in a box.'], ['MIN', 'I helped because you needed it.']],
    ask: { k: 'findings', q: 'Who receives the verified findings?', opts: [{ v: 'E', t: 'An independent reviewer, now, with the continuity worry written in' }, { v: 'D', t: 'Half a month for her corrections, with a fixed date' }, { v: 'S', t: 'Keep them in Halloran’s office. "Fix it."' }] } },
  { art: 'c20-2', if: 'findings=S', cap: 'Lena walked me to the stairwell.',
    says: [['APT', 'You didn’t ask me before you promised for the office.'], ['ME', 'I didn’t promise for you.'], ['APT', 'Then I will decide what I have to report.']] },
  { art: 'c20-2', cap: 'I had wanted one person I could put on the other side of the room and call responsible. There were several. Some of them had helped me.' }
] });

ch({ id: 'W20', m: 33, t: 'The Copies', p: [
  { art: 'w20', cap: 'Halloran’s office wanted a shorter summary, while a field needed the equipment described in the long one. Both had to stay true: the records mattered, and people still needed the repair. Ivo offered to carry a bundle to the backup office.',
    says: [['ATC', 'I can carry it. You can keep the receipt.'], ['ME', 'I want a record of what moves.'], ['ATC', 'Then make one.']] }
], op: { sites: ['arden_yard', 'area_centre', 'capital_annex'], mo: 0.4, r: 50,
  brief: 'Keep the original records safe at the backup office, and the repair moving. The north is under watch again.',
  tasks: [{ k: 'radar', at: 'area_centre', t: 'A radar watching the Northern Area Centre' }, { k: 'flights', at: 'ashford_airport', n: 8, t: 'Land 8 flights a day at Ashford' }],
  raid: { name: 'missiles on the north', h: [10, 30], warn: 40, intel: 'Cruise missiles towards the ridge.', hits: [{ bat: 'cm30', n: 2, at: 'saga:area_centre' }] } },
after: res('W20', 'w20', 'The work and the evidence both survived. Halloran’s interest in it stayed unresolved.',
  'One task needed another signed handover, and kept its state.',
  'A delay with a written cause. Nobody burned the only evidence.') });

ch({ id: 'C21', m: 33.2, t: 'The Second Signature', fx: ['stage:6'], p: [
  { art: 'c21-1', cap: 'The senior civil coordinator was leaving for treatment. My appointment had been extended with a written remit: I would lead the civil team and chair the cell’s civil side. Lena put the vacancy file on my desk.',
    says: [['APT', 'I want a second person who can sign off these civil updates.'], ['ME', 'Sera can.'], ['APT', 'I’m asking what she needs to do it without you standing behind her. And permission to tell you no.']] },
  { art: 'c21-1', cap: 'We gave Sera a defined remit, a handover and someone checking her first weeks. She asked what happened if I was the one who was wrong, and we wrote that in too. June carried a box of stationery to her new desk.',
    says: [['JUNE', 'Do I call you something different?'], ['SERA', 'Only if you already liked calling me Sera.']] },
  { art: 'c21-2', cap: 'An alarm in the afternoon. My phone lit up with a message from Mira, with the ringtone I had used before the strike. My hand missed the office receiver.',
    says: [['SERA', 'I’ve got the civil update. Read the next one.']] },
  { art: 'c21-2', if: 'findings=D', cap: 'Half a month after the meeting, Lena brought me the date.',
    says: [['APT', 'Today is the date we gave them.']],
    ask: { k: 'deadline', q: 'Halloran asks for more time.', opts: [{ v: 'kept', t: 'Send the findings and her correction plan, as agreed' }, { v: 'broken', t: '"Give it another week."' }] } },
  { art: 'c21-1', cap: 'I signed because she had done the work. There were people I could have recommended who would have made my days easier by never disagreeing with me. She wasn’t one of them.' }
] });

ch({ id: 'W21', m: 35, t: 'The Deputy’s Signature', p: [
  { art: 'w21', cap: 'Sera corrected me in front of another official. She was right about the field. I had to let the correction stand without calling it insubordination. Later a distribution discrepancy went into the log as one of several items for review. It was not enough to reveal anyone.',
    says: [['SERA', 'The field hasn’t confirmed that yet.'], ['ME', 'It was expected by noon.'], ['SERA', 'It isn’t noon’s answer we need now.']] }
], op: { sites: ['corbin_airport', 'area_centre'], mo: 0.5, r: 50,
  brief: 'A limited civil service through Corbin, run by the backup team on Sera’s signature.',
  tasks: [{ k: 'open', at: 'corbin_airport', t: 'Keep a runway open at Corbin', keep: true }, { k: 'flights', at: 'corbin_airport', n: 8, t: 'Land 8 flights a day at Corbin' }],
  raid: { name: 'drones on Corbin', h: [8, 24], warn: 40, intel: 'Drones from Salik, south towards Corbin.', hits: [{ bat: 'dr_salik', n: 6, at: 'saga:corbin_airport' }] } },
after: res('W21', 'w21', 'The corrected service ran. Her competence was real. That was part of why it would hurt.',
  'Her signature reached its limit, and the decision went up to someone else.',
  'A civil update stayed unconfirmed, and we ran a reduced plan rather than call it done.') });

ch({ id: 'C22', m: 36, t: 'A Day Without Sirens', p: [
  { art: 'c22-1', cap: 'I went to collect something Ivo had kept for me at the airfield. He had put it in a small box, so neither of us had to search for a reason for the visit. We ended up in a café, because he had not eaten.',
    says: [['ATC', 'I can open a packet.'], ['ATC', 'Apparently I can’t.']] },
  { art: 'c22-1', if: 'ivo=public', cap: 'I had said in public more than I could prove about him.',
    ask: { k: 'ivofix', q: 'What you said about Ivo:', opts: [{ v: 'yes', t: '"I said more than I could prove. I’ll correct it."' }, { v: 'no', t: 'Leave it' }] } },
  { art: 'c22-2', cap: 'Mira came for dinner. I had made something simpler than the meal I burned before the separation. She sat in the repaired chair, and I almost asked her not to. She noticed the pause. The chair did not collapse. She complained about the salt. For a while the apartment held a person who was alive and irritated with me.' },
  { art: 'c22-3', cap: 'The sirens did not sound. I put the phone on charge beside the bed instead of holding it. I slept that night. I remember, because I used to count the nights when I did.' }
] });

ch({ id: 'W22', m: 37, t: 'The Port, Again', p: [
  { art: 'w22', cap: 'Tomas had a different trolley. The old one had finally broken, after everyone had stopped noticing it. The waiting room was familiar; the staff and passengers were not all the same. Sera knew the routines without asking.',
    says: [['TOMAS', 'You can use the other room.'], ['ME', 'It’s open?'], ['TOMAS', 'Since Tuesday. We finally found someone who could tell us yes.']] },
  { art: 'w22-tv', cap: 'That evening their state television showed Westhaven. Vesna Kolar read it.',
    says: [['KOLAR', 'They show you their harbour. We show the other half.']] }
], op: { sites: ['westhaven_port', 'southport_port', 'westhaven_reception'], mo: 0.5, r: 50,
  brief: 'Westhaven’s harbour and Southport’s. Keep Westhaven flying, and ask for cover over Southport.',
  tasks: [{ k: 'flights', at: 'westhaven_airport', n: 6, t: 'Land 6 flights a day at Westhaven' }, { k: 'ask', at: 'southport_port', unit: 'mrsam', h: 4, t: 'Ask for a medium-range battery over Southport' }],
  raid: { name: 'raid on the ports', h: [10, 30], warn: 40, intel: 'Missiles and drones towards both harbours.', hits: [{ bat: 'cm30m', n: 2, at: 'saga:southport_port' }, { bat: 'dr_senitz', n: 6, at: 'saga:westhaven_port', t: -300 }] } },
after: res('W22', 'w22', 'What had been built before changed the outcome. The staff got to notice that their work mattered.',
  'The other room took some of the work. The queue was still there.',
  'The coast’s service stopped, and we followed the people to where they had gone.') });

ch({ id: 'C23', m: 38, t: 'Cross-Check', p: [
  { art: 'c23-1', cap: 'An investigation into repeated disclosures had narrowed the period and the kind of civil update involved. A version I remembered correcting turned up where it should not have been used. My first explanation did not fit the sequence.',
    says: [['ME', 'There has to be another copy.'], ['APT', 'Then we’ll find out whether there was.'], ['VOICE', 'Then take your time.']] },
  { art: 'c23-2', cap: 'Lena stopped me before I went to Sera’s desk.',
    says: [['APT', 'They haven’t asked us to confront anyone.'], ['ME', 'She sat with those families. I saw her.'], ['APT', 'So did I.']] },
  { art: 'c23-2', cap: 'A junior clerk whose name had been in the first request asked whether they were in trouble.',
    ask: { k: 'clerk', q: 'The clerk asks if they are in trouble.', opts: [{ v: 'honest', t: '"They’re checking a set of records. I can’t discuss it."' }, { v: 'accuse', t: '"If you’ve done nothing, you should be able to explain the sequence."' }] } },
  { art: 'c23-3', cap: 'Late in the afternoon Ivo rang to say he would leave the old records at the desk, as he did every week. I said I was busy. Then I was sent for a routine source in the room next to Sera’s. She was already there. She closed the door.',
    says: [['SERA', 'They spoke to you.'], ['ME', 'You need to speak to Lena.'], ['SERA', 'I’m speaking to you.']] }
] });

ch({ id: 'C24', m: 38, t: 'The Door Closed', fx: ['stage:7'], p: [
  { art: 'c24-1', cap: 'She took out a gun. I backed until the table stopped me.',
    says: [['ME', 'Sera.'], ['SERA', 'Sit down. Please.'], ['SERA', 'I need you to make a call. Tell them you’ve found a revision error and need time.'], ['ME', 'It isn’t my review.'], ['SERA', 'They’ll listen to you. Make the call.']] },
  { art: 'c24-card', if: 'card=glad|room', cap: 'In her open folder of personal papers was the card from her birthday. She had kept it.' },
  { art: 'c24-1', cap: 'My breathing had become loud. I tried to slow it and could not.',
    says: [['ME', 'You sat with June.'], ['SERA', 'Don’t. I know where I sat.'], ['ME', 'I can’t do this again.']] },
  { art: 'c24-3', cap: 'Ivo knocked with the records, as he did every week, and was already opening the door.',
    says: [['ME', 'Don’t come in.'], ['ATC', 'All right. I’ll leave it here.']] },
  { art: 'c24-3', cap: 'Everything happened before anyone finished a sensible sentence. She fired. Ivo fell against the frame and the folder opened on the floor. A chair went over. The gun hit the floor and I reached it first. She backed away with her hands where I could see them.',
    says: [['ME', 'Stay there.'], ['SERA', 'I’m staying.']],
    ask: { k: 'door', q: 'She is unarmed. Ivo is on the floor.', opts: [{ v: 'A', t: '"We need help in here. He’s hurt." Keep her back.' }, { v: 'B', t: 'Hit her.' }, { v: 'C', t: 'Fire.' }] } },
  { art: 'c24-4', if: 'door=A', cap: 'I remembered the sound of the folder opening. I didn’t remember dropping the phone.' },
  { art: 'c24-4', if: 'door=B', cap: 'There was a mark on her face that hadn’t been there when the gun hit the floor.' },
  { art: 'c24-4', if: 'door=C', cap: 'I said there had been a struggle. There had. It was over before I fired.' },
  { art: 'c24-5', cap: 'They took me out of the room. My access was suspended pending review. Lena found me in the corridor, rubbing at a mark on my sleeve.',
    says: [['ME', 'Is Ivo alive?']] }
] });

ch({ id: 'C25', m: 38.1, t: 'The Chair Beside the Bed', p: [
  { art: 'c25-1', cap: 'Ivo lived. They asked him whether he wanted my visit before they let me in.',
    says: [['ATC', 'You’ll have to come round. I can’t see you there.'], ['ATC', 'That hurt?'], ['ME', 'Not much.']] },
  { art: 'c25-1', if: 'door=A', cap: '',
    says: [['ATC', 'They have her?'], ['ME', 'Yes.'], ['ATC', 'You can tell someone. It doesn’t have to be me today.']] },
  { art: 'c25-1', if: 'door=B', cap: '',
    says: [['ATC', 'Did she come at you again?'], ['ME', 'No.'], ['ATC', 'All right.']] },
  { art: 'c25-1', if: 'door=C', cap: '',
    says: [['ATC', 'They told me she died. After?'], ['ME', 'After I had the gun.'], ['ATC', 'Not now.']] },
  { art: 'c25-2', cap: 'Lena brought my work notebook and a written account of the restrictions. The board would go on under her name.',
    says: [['ME', 'When can I go back?'], ['APT', 'They haven’t decided. The work is covered.'], ['APT', 'You did not stop being a person when someone else took your desk.']] },
  { art: 'c25-2', if: 'clerk=accuse', cap: 'The clerk I had spoken to had been cleared, and had asked not to report to me if I came back.',
    says: [['ME', 'I didn’t name them publicly.'], ['APT', 'You spoke to them.']] },
  { art: 'c25-key', cap: 'Weeks later, as I was leaving his second visit:',
    says: [['ATC', 'Bag. Front pocket.'], ['ATC', 'Sector 9. The locker on the left. When I’m out of here, we open it together. If I’m not out of here, open it anyway.'], ['ATC', 'Don’t make it a scene. Put it in your pocket.']] },
  { art: 'c25-key', if: 'door=C', cap: 'He had hesitated before he gave it.',
    says: [['ATC', 'I don’t trust you with much at the moment. I trust you with this more than I trust me.']] },
  { art: 'c25-2', cap: 'Outside I rang Mira to say the visit had gone all right. She asked what that meant. I said he had complained about the potatoes. She laughed, and then went quiet. Good, she said. It was good. It was not enough.' }
] });

ch({ id: 'W23', m: 41, t: 'Someone Else Takes the Desk', p: [
  { art: 'w23', cap: 'Lena asked me one bounded factual question through an authorised channel. I had been waiting for the call, and I resented how small the question was. On the board’s header her name stood where mine had been.',
    says: [['ME', 'Do you need me there?'], ['APT', 'I need the source you used.'], ['ME', 'I can give you that.'], ['APT', 'Then start there.']] }
], op: { sites: ['ashford_airport', 'area_centre', 'fort_ashby_base'], mo: 0.5, r: 50,
  brief: 'The cell runs under L. Okafor. Keep Ashford flying, and keep Fort Ashby’s jets out of the open.',
  tasks: [{ k: 'flights', at: 'ashford_airport', n: 10, t: 'Land 10 flights a day at Ashford' }, { k: 'cover', at: 'fort_ashby_base', r: 160, t: 'A battery covering Fort Ashby Air Base' }],
  raid: { name: 'missiles on the capital', h: [8, 24], warn: 12, intel: 'Ballistic launchers raised. The capital’s airport is in reach.', hits: [{ bat: 'mb2b', n: 3, at: 'apt:capital' }] } },
after: res('W23', 'w23', 'The team worked without needing me to be indispensable. I could still matter.',
  'A limited civil service stayed up while another task waited.',
  'Something real went wrong, and it was handled and reviewed.') });

ch({ id: 'C26', m: 42, t: 'The Whole Answer', p: [
  { art: 'c26-1', if: 'door!=C', cap: 'The investigators combined the office’s access records with evidence from outside. Sera had passed information to them. I was given her recorded account, as far as my status allowed.',
    says: [['SERA', 'At first I believed what they told me about limiting the next attack.'], ['SERA', 'Because the people allowed to decide were lying about what they had. I thought I could make the next decision less dangerous.'], ['VOICE', 'And when you knew it was being used differently?'], ['SERA', 'By then I had things to protect too.'], ['SERA', 'Those people needed the right place to go.']] },
  { art: 'c26-1', if: 'door=C', cap: 'There was no recording that explained her. The investigation established what she had passed on, to whom, and some of what it cost. Some of what she meant stayed unknown. A colleague said Sera had once defended a family when nobody else would take the call.',
    says: [['ME', 'You don’t know why.'], ['VOICE', 'Neither do you.']] },
  { art: 'c26-2', cap: 'Lena told June that Sera had asked whether June knew the work at the desk had been real.',
    says: [['JUNE', 'I know she helped me. I don’t want to talk to her.']] },
  { art: 'c26-2', cap: 'Halloran’s office wanted a briefing that put the spy and the green boxes into one paragraph.',
    says: [['ME', 'These aren’t the same events.']],
    ask: { k: 'brief', q: 'The briefing joins Sera to Arden’s failures.', opts: [{ v: 'separate', t: '"Sera didn’t install those units. Keep the findings separate."' }, { v: 'combined', t: '"People need to understand we had an enemy inside the office."' }] } },
  { art: 'c26-3', cap: 'I asked whether anything connected Sera to Nadia being at the airport. There was nothing. I had kept looking for a person who knew she was there. Knowing who had attacked the airport did not give me that person. At home the notebook of Nadia’s measurements was still on its shelf. I put the investigation papers somewhere else.' }
], fx: [{ if: 'door=A', fx: ['route=A'] }, { if: 'door=B', fx: ['route=B'] }, { if: 'door=C', fx: ['route=C'] }] });

})(window.IC);
