/* Iron Canopy — (story v3) the chapters, part one: the days before the strike, the strike, and the first year of
   the war. From Preston's story v3 and the v3.1 addendum (the board, Northline 310). Each chapter is plain data read
   by saga.js: m the month (0 is the strike), t the title, p the scene's panels, op the operation, after the panels
   once it is over, pre / fx effects at its start and end. Speakers are cast keys (data.js); ME is the narrator then,
   whose face is never shown. Narration is his, years later, in the past tense. */
(function (IC) {
'use strict';
const ch = c => IC.SAGA.push(c);

/* ---------- before ---------- */
ch({ id: 'C01', m: -0.4, t: 'Borrowed Chairs', p: [
  { art: 'c01-1', cap: 'We had been married a little over two years. The chair came from the flat below; they were throwing it away. Nadia carried it upstairs herself and left it in the middle of the kitchen.',
    says: [['NADIA', 'Don’t.'], ['ME', 'I was looking.'], ['NADIA', 'With your hands.']] },
  { art: 'c01-1', cap: 'I knew which end of the loaf she liked. I mention that because, for a long time, I used it as evidence that I had been paying attention.',
    says: [['ME', 'It’s just the rota.'], ['NADIA', 'Then it can wait until you’ve had your tea.']] },
  { art: 'c01-2', cap: 'Late morning, at the workshop. A cooperative in a former shop, and a cabinet that did not want to go through the door.',
    says: [['BEA', 'Toward you.'], ['NADIA', 'That’s your end.'], ['BEA', 'I know which end I’ve got.']] },
  { art: 'c01-3', cap: 'Bea wanted her to send the photographs to a workshop near her sister Rina’s. They did placements too. I was answering a message about a shift while she told me.',
    says: [['ME', 'You made that disappear.'], ['NADIA', 'Not quite. There.'], ['ME', 'You’re pointing at wood.'], ['NADIA', 'It’s mostly wood.']] },
  { art: 'c01-3', cap: 'She was checking the coming week’s hours. I asked for an evening. She asked me to choose one I could keep.',
    says: [['NADIA', 'Thursday after six?'], ['ME', 'I can do Thursday.'], ['NADIA', 'Then tell me where we’re going.']],
    ask: { k: 'eve', q: 'Where are we going on Thursday?', opts: [
      { v: 'cafe', t: 'The riverside café, the one with the tables that rock' },
      { v: 'film', t: 'The late film, then a walk' },
      { v: 'home', t: 'Dinner at home. I’m cooking' }] } },
  { art: 'c01-4', cap: 'That evening I was home before her. We ate standing at the counter, because the table was covered in newspaper. A phone buzzed. Neither of us looked at it. For a little while, neither of us had anything to explain.',
    says: [['NADIA', 'It’s sticking to my teeth.'], ['ME', 'You’re welcome.']] },
  { art: 'c01-4', cap: 'A few days later I brought something home. She had not asked me to buy anything.',
    ask: { k: 'gift', q: 'What did I bring her?', opts: [
      { v: 'dish', t: 'A small blue ceramic dish she had liked' },
      { v: 'book', t: 'A used illustrated book about furniture and repair' },
      { v: 'prints', t: 'Prints of the workshop photographs she wanted' }] } },
  { art: 'c01-gift-dish', if: 'gift=dish', cap: 'She turned it over, ran a finger round the underside and put a piece of paper beneath it before it touched the table. Then she dropped a brass fitting from her pocket into it. It made a small sound I can still hear.',
    says: [['ME', 'Do you want me to take it back?'], ['NADIA', 'No. I don’t want it scratching the table. A place for workshop odds and ends.']] },
  { art: 'c01-gift-book', if: 'gift=book', cap: 'An old owner had argued with the book in pencil, in the margins. She sat down to show me why he was partly right and partly talking nonsense. I did not need to understand the craft to enjoy her explaining it.',
    says: [['NADIA', 'Someone hated this page.']] },
  { art: 'c01-gift-prints', if: 'gift=prints', cap: 'I brought the contact sheet and asked her to choose the prints. She took out the one I expected her to choose. We moved the pictures round together. She chose their order.',
    says: [['ME', 'Not the blue cabinet?'], ['NADIA', 'Everyone likes that one. This ugly thing took twice as long.']] }
] });

ch({ id: 'C02', m: -0.2, t: 'After Six', p: [
  { art: 'c02-1', cap: 'Ivo Marsh had taught half the controllers at Ashford. That afternoon he was trying to fit his coat onto a hook already holding somebody else’s. He looked at the rota inside the locker door a moment longer than reading takes.',
    says: [['ATC', 'You’re early.'], ['ME', 'By three minutes.'], ['ATC', 'Still counts. There’s food in yours.'], ['ME', 'There was food.'], ['ATC', 'Then something’s died in it.']] },
  { art: 'c02-2', cap: 'June was in training at the console, young enough to be embarrassed by every correction, and good at the work. There were things I could do for somebody at work and know, immediately, that they had helped. I found that difficult to leave.',
    says: [['JUNE', 'I thought she’d finished.'], ['ME', 'Listen again.']] },
  { art: 'c02-2', cap: 'Six o’clock, Thursday. The qualified colleague was there to take the rest. June’s supervised work could go on without me.',
    ask: { k: 'follow', q: 'The evening I promised Nadia:', opts: [
      { v: 'kept', t: 'Hand over as agreed and go home' },
      { v: 'resched', t: 'Call her now: Friday instead, and mean Friday' },
      { v: 'missed', t: 'Text "twenty minutes" and stay with the extras' }] } },
  { art: 'c02-2', if: 'follow=kept', says: [['ATC', 'Was the evening tonight?'], ['ME', 'Yes.'], ['ATC', 'Then go before someone finds another favour.']] },
  { art: 'c02-2', if: 'follow=resched', cap: 'I was tired and knew I would be poor company. I called before she had started waiting. On Friday she checked that I had really finished work. I had.',
    says: [['ME', 'Could we do Friday? I mean Friday, not whenever this gets quieter.']] },
  { art: 'c02-date-cafe', if: 'eve=cafe & follow=kept|resched', cap: 'The table rocked. She folded a receipt under one leg before I could ask the waiter. She tried something new, disliked it, and kept taking bites from my plate. For once I left the phone in my coat.',
    says: [['ME', 'We could have stayed home. Ours does that.'], ['NADIA', 'Ours has a repair department.'], ['NADIA', 'Don’t look so pleased. I still chose mine.']] },
  { art: 'c02-date-film', if: 'eve=film & follow=kept|resched', cap: 'She laughed at a scene the film clearly expected us to take seriously, and I laughed because she could not stop. On the walk afterwards she told me about a part of her work I had never seen.',
    says: [['NADIA', 'You slept through the explanation.'], ['ME', 'Then I’m the lucky one.']] },
  { art: 'c02-date-home', if: 'eve=home & follow=kept|resched', cap: 'I had cut the vegetables unevenly and very slowly. We ate at the table, on the repaired chair and the stool. Afterwards she started to pick up a plate.',
    says: [['NADIA', 'Were you doing them individually?'], ['ME', 'I wanted them to feel considered.'], ['ME', 'I said an evening. Not dinner and a job.']] },
  { art: 'c02-missed', if: 'follow=missed', cap: 'She had eaten. One plate was covered on the counter. I had an answer for why I was late. I kept giving her that answer. It was accurate. It did not answer her.',
    says: [['ME', 'June had an assessment. She was—'], ['NADIA', 'I know who June is.'], ['NADIA', 'I asked you to come home when you said you would.'], ['NADIA', 'I can’t do this tonight.']] },
  { art: 'c02-photos', cap: 'Before she packed, she was choosing photographs for the placement near Rina’s. A missed evening had not taken away every chance to listen.',
    says: [['ME', 'If they offered it, would you want to stay there?']],
    ask: { k: 'listen', q: 'She was still deciding.', opts: [
      { v: 'heard', t: 'Ask what she wants to learn there' },
      { v: 'repaired', t: 'Start on trains and costs, then stop: "Sorry. Tell me about the work first."' },
      { v: 'insist', t: 'Keep working out the trains and costs. I am helping' }] } },
  { art: 'c02-photos', if: 'listen=heard', says: [['NADIA', 'I don’t know yet. I’d like to ask myself that before somebody starts working out the trains.']], cap: 'I said I could wait. She told me what she wanted to learn, including a small piece of work that had sounded unimportant to me when she first mentioned it.' },
  { art: 'c02-photos', if: 'listen=repaired', says: [['NADIA', 'I wasn’t asking you to price it yet.'], ['ME', 'Sorry. Tell me about the work first.']], cap: 'She accepted the correction and went on.' },
  { art: 'c02-photos', if: 'listen=insist', says: [['NADIA', 'I wasn’t asking you to price it yet.']], cap: 'She stopped trying to explain and put the pictures away. She was not angry. She was tired of having the same missing conversation.' }
] });

ch({ id: 'C03', m: -0.03, t: 'The Spare Room', pre: ['depart'], p: [
  { art: 'c03-1', cap: 'The evening before. At the workshop Bea held the light at an angle that made the repair look worse, then wrapped a small tool in a cloth.',
    says: [['BEA', 'Take this.'], ['NADIA', 'I don’t know how long I’m going for.'], ['BEA', 'Then bring it back whenever that is.']] },
  { art: 'c03-2', if: 'depart=decided', cap: 'An open suitcase on the bed. Folded clothes, a practical pair of shoes, a pouch of workshop tools. I had heard the words before. I had been treating them as distress rather than a decision.',
    says: [['NADIA', 'I’m staying with Rina.'], ['ME', 'For a bit.'], ['NADIA', 'I want a divorce.'], ['NADIA', 'I still like you. That doesn’t mean I can keep living like this.']] },
  { art: 'c03-2', if: 'depart=space', cap: 'An open suitcase on the bed, half packed. Some of the last days had been better. It was a real difference. It was not a promise.',
    says: [['NADIA', 'I’m staying with Rina.'], ['NADIA', 'Please don’t make me say what it means before I’ve even got there.'], ['ME', 'Can we talk when you know?'], ['NADIA', 'Yes. When I know. Not every time you get frightened.']] },
  { art: 'c03-2', if: 'depart=repair', cap: 'An open suitcase on the bed. She was still going. The marriage was still unresolved. But she had put a time in her calendar, and I had put it in mine.',
    says: [['NADIA', 'I’m staying with Rina. But I want us to talk when I’ve had a little space. Properly. Saturday, if we can both keep it.'], ['ME', 'I’ll keep it.'], ['NADIA', 'I know you mean it now. I’m not asking for another speech.']] },
  { art: 'c03-3', cap: 'She could not find the spare charger. For a minute the search let us behave like ourselves.',
    says: [['ME', 'You should take the long one.'], ['NADIA', 'This one’s fine.'], ['ME', 'Rina’s socket is behind the bed.'], ['NADIA', 'All right.']] },
  { art: 'c03-3', if: 'depart=decided|space', cap: 'There were still things I knew how to do for her. I kept expecting them to add up to an answer she hadn’t asked for.' },
  { art: 'c03-3', if: 'depart=repair', cap: 'There were still things I knew how to do for her. We hadn’t settled it. We had put a time aside to speak. I had finally understood that keeping the time was part of what she was asking.' },
  { art: 'c03-4', cap: 'She was on the sofa, rubbing at a spot of old paint on her wrist. I put the glass of water within reach. We believed there would be other conversations.',
    says: [['NADIA', 'You need to sleep.'], ['ME', 'So do you.'], ['ME', 'Night.'], ['NADIA', 'Night.']] }
] });

/* ---------- the strike (fixed) ---------- */
ch({ id: 'C04', m: 0, t: 'Departures', pre: ['war'], sceneAt: 'warn', p: [
  { art: 'c04-1', cap: 'The day of the strike. I was on a break at the counter in the control building, flattening the corner of a sandwich wrapper, when my phone went.',
    says: [['ME', 'Hi.'], ['NADIA', 'Hi.'], ['ME', 'I was going to call you.'], ['NADIA', 'I know.']] },
  { art: 'c04-2', if: 'depart=decided', cap: 'She was sitting with her case, the long charging cable in her lap.',
    says: [['NADIA', 'I’ll let you know when I’m at Rina’s.'], ['ME', 'I’m trying here.'], ['NADIA', 'I’m not asking you to solve this over the phone. I told you I wanted a divorce.']] },
  { art: 'c04-2', if: 'depart=space', cap: 'She was sitting with her case, the long charging cable in her lap.',
    says: [['NADIA', 'I’ll call when I’m at Rina’s.'], ['ME', 'About us?'], ['NADIA', 'To tell you I got there. Can that be enough for today?'], ['ME', 'Okay.']] },
  { art: 'c04-2', if: 'depart=repair', cap: 'She was sitting with her case, the long charging cable in her lap.',
    says: [['NADIA', 'Have you put Saturday in?'], ['ME', 'Yes. I’m not working it.'], ['NADIA', 'All right.'], ['ME', 'Call when you get there.']] },
  { art: 'c04-3', cap: 'June called me over. A return on the screen that did not fit what we expected, and a second report that made it worse. For her, these were familiar words in a familiar conversation. For me, their meaning had changed.',
    says: [['JUNE', 'Can you look at this?'], ['NADIA', 'Are you there?'], ['ME', 'I’m here. Give me a second.']] },
  { art: 'c04-3', cap: 'Ivo looked once at the second report.',
    says: [['ME', 'We need the alarm.'], ['ATC', 'Do it. I’m calling defence.']],
    ask: { k: 'alarm', q: 'The local warning is yours to raise.', opts: [{ v: 'raised', t: 'Raise the alarm' }] } },
  { art: 'c04-4', cap: 'Through her phone I heard the same alarm, a moment late.',
    says: [['NADIA', 'What’s that?'], ['ME', 'Where are you now?'], ['NADIA', 'At the airport. Departures, by the windows.'], ['ME', 'Go with them. Away from the glass.']] }
], op: { sites: ['ashford_airport'], mo: 0.08, r: 50, result: 'fixed',
  brief: 'Inbound from the north towards Ashford International. Ivo Marsh has called defence. There is nothing over the airport that can fire.',
  raid: { name: 'first strike', h: 0.05, warn: 4, intel: 'Ashford tower: unidentified fast returns from the north, towards the airport.',
    hits: [{ bat: 'cm30', n: 4, at: 'apt:capital', t: 0 }] } },
after: [
  { art: 'c04-5', cap: 'The right half became black. The left did not.',
    says: [['ME', 'Talk to me.'], ['NADIA', 'I’m here.'], ['ME', 'Nadia? I can’t hear you.']] },
  { art: 'c04-6', cap: 'I had pressed the desk microphone without realising it. His hand, when it covered mine, was not quite steady.',
    says: [['ATC', 'I’m taking this position.'], ['ATC', 'Listen to me. I’ve got it.']] },
  { art: 'c04-6', cap: 'I called back. When it went to voicemail, I thought that meant her phone was still working.' }
] });

ch({ id: 'C05', m: 0.01, t: 'Still Connected', pre: ['forces'], p: [
  { art: 'c05-1', cap: 'Dara brought my coat and a paper cup of water. She held the coat open enough for me to find the sleeve. I missed it.',
    says: [['DARA', 'The lift’s out. We’ll use the stairs.'], ['ME', 'I can walk.'], ['DARA', 'I can see that.']] },
  { art: 'c05-2', cap: 'In the service corridor a woman kept trying a phone with a cracked screen. A boy of about ten held a bag with a zip that stuck. My charger would not fit her phone. The third person I asked had one. I could do that.' },
  { art: 'c05-3', cap: 'A porter called Tomas was keeping a doorway clear in the reception room, with a torn sleeve and a voice that had been used too much.',
    says: [['ME', 'Who has the list?'], ['TOMAS', 'They’re putting it together.'], ['TOMAS', 'Give them her name.']] },
  { art: 'c05-4', cap: 'Rina answered from somewhere ordinary.',
    says: [['RINA', 'Has she landed?'], ['ME', 'There was an attack.'], ['RINA', 'I need you to tell me where she is.'], ['ME', 'I don’t know.'], ['RINA', 'I’m coming.']] },
  { art: 'c05-4', cap: 'Dara had to go back to work. She told me where she would be and made sure Tomas knew who I was. She missed the bus home. I found that out much later.' }
] });

ch({ id: 'C06', m: 0.03, t: 'Family Reception', p: [
  { art: 'c06-1', cap: 'The waiting room had changed without improving. The intake worker was trying to reconcile two records, and I moved her papers too sharply. A pen fell. She did not raise her voice: "I don’t want to give you information about the wrong person."',
    says: [['ME', 'It’s on the form.']] },
  { art: 'c06-2', cap: 'I said no, and then asked for it. Tomas brought it back without comment and pulled a chair close enough for my feet. It was not how I take it. I drank it anyway.',
    says: [['TOMAS', 'No sugar. I can get some.'], ['ME', 'You should sit down.'], ['TOMAS', 'In a minute.']] },
  { art: 'c06-3', cap: 'Rina came through the door with an overnight bag and a coat she no longer wanted to wear. For a moment it looked as though we would embrace. We did not quite manage it.',
    says: [['RINA', 'Anything?']] },
  { art: 'c06-4', cap: 'In a small room with four chairs, a family liaison told us the hospital had identified Nadia, and that she had died.',
    says: [['ME', 'But she was talking.'], ['ME', 'She was walking. She was going inside.']] },
  { art: 'c06-5', cap: 'Later there was a form, and a question about her address. There was no box for what had happened between us. I was grateful for that at first. People went past carrying blankets and clipboards. The machinery of helping people continued.' }
] });

ch({ id: 'C07', m: 0.1, t: 'What We Could Carry', p: [
  { art: 'c07-1', cap: 'My sister Mira had driven down from Hollin through the night, with the children asleep in the back. She had not asked whether she should come. I stood at my own door, searching my pockets.',
    says: [['SISTER', 'Other side.'], ['ME', 'I know where it is.'], ['SISTER', 'All right.']] },
  { art: 'c07-2', cap: 'Ivo came with a bag from the control building: my charger, a notebook, and the sandwich I never ate, unwrapped and bagged separately. Ivo had known my father. I knew that the way you know facts about older people: as something true and finished.',
    says: [['ME', 'Did you hear it? On the recording?'], ['ATC', 'People heard you. No one thinks you didn’t try.'], ['ME', 'That’s not what I asked.'], ['ATC', 'No.']] },
  { art: 'c07-3', if: 'depart=decided', cap: 'Days later Rina brought back the suitcase. Folded clothes, shoes, workshop tools.',
    says: [['ME', 'She wasn’t taking much.'], ['RINA', 'She was going to come back for the rest. Her things.']] },
  { art: 'c07-3', if: 'depart=space', cap: 'Days later Rina brought back the suitcase. Folded clothes, shoes, workshop tools.',
    says: [['ME', 'She didn’t know how long she wanted.'], ['RINA', 'No. I told her the room was there.']] },
  { art: 'c07-3', if: 'depart=repair', cap: 'Days later Rina brought back the suitcase. Folded clothes, shoes, workshop tools. They had not become proof that the marriage was saved, or proof that she never meant to try.',
    says: [['ME', 'We’d put Saturday in.'], ['RINA', 'She told me.']] },
  { art: 'c07-3', if: 'gift=book|prints', cap: 'What I had given her came back with the case. I put it in the kitchen, where she had kept it.' },
  { art: 'c07-4', cap: 'At the workshop Bea showed me the small unfinished task on the cabinet. I could not tell the difference until she pointed.',
    says: [['BEA', 'Customer’s coming Friday.'], ['ME', 'Can you do it?'], ['BEA', 'Yes.']] },
  { art: 'c07-5', cap: 'Mira left a note: the children had a school place at the end of the road from Monday, and she had taken the early shift at a friend’s bakery in East Bank, "until the road’s sorted". There was a loose screw under the chair. I could not find where it came from. Nothing was fixed.' },
  { art: 'c07-5', cap: 'A message came from the Minister of Transport’s office about a document Rina and I had been trying to get. It used Nadia’s name correctly. Petra Halloran helped with that before she asked me for anything. It mattered.' }
] });

/* ---------- the first year of the war ---------- */
const res = IC.sagaRes;

ch({ id: 'C08', m: 0.7, t: 'An Appointment', fx: ['stage:2'], p: [
  { art: 'c08-1', cap: 'Three weeks after the strike the corrected document came in an ordinary envelope. Rina said thank you for chasing it. I said someone had helped, and did not say whose name. At the ministry I sat beside a man with a folder of road photographs, who had travelled a long way for his appointment.',
    says: [['MAN', 'You should. They keep you a while.']] },
  { art: 'c08-2', cap: 'Petra Halloran came round her desk to meet me and did not try to embrace me. She asked whether the correction had been right. Then Lena Okafor came in with a thin folder.',
    says: [['MIN', 'The emergency office needs a civilian liaison. Someone who understands what happens between a report and the person who has to act on it.'], ['ME', 'I know one part of the airport.'], ['APT', 'Good. Keep saying that.'], ['APT', 'If the reports disagree, you say they disagree. You don’t choose the one that makes the room happier.']] },
  { art: 'c08-2', cap: 'Temporary appointment, a defined review date. The airports and the airspace would be mine to run; the weapons would not. Later an assistant asked how the announcement should read.',
    says: [['MIN', 'If it is too much, we change it.'], ['ME', 'People keep telling me what will be too much.'], ['MIN', 'I’m telling you what happens if it is.']],
    ask: { k: 'announce', q: 'The office will announce the appointment. What may it say?', opts: [{ v: 'work', t: 'Only the work. Leave Nadia out of it.' }, { v: 'brief', t: 'A brief reference, if I see the wording first.' }] } },
  { art: 'c08-1', cap: 'The man with the photographs was still waiting when I came out. The road could wait, apparently. I listened to him for a few minutes and wrote down who he had been told to call. I could not fix it that day.' }
] });

ch({ id: 'C09', m: 1, t: 'The New Desk', p: [
  { art: 'c09-1', cap: 'My desk was a spare table between two filing cabinets. It rocked. Lena walked past, pushed a wooden shim under the other leg, and kept going.',
    says: [['ME', 'How long has that been there?'], ['APT', 'Longer than you.']] },
  { art: 'c09-2', cap: 'At the counter a woman was explaining the same journey for the third time. Sera Vale had moved her bag off the chair before offering it. I brought the new list and nearly told her she was using the wrong one. She showed me two spellings of the same name.',
    says: [['SERA', 'I believe you. Will you sit while I check?'], ['SERA', 'Same person. I’m making sure we don’t send her round again.'], ['SERA', 'Sera.']] },
  { art: 'c09-2', cap: 'Later a summary said a family’s movement was completed. The family said nobody had arrived. A plan had been copied into the wrong column. No enemy hand was needed. I went back and said she was right.',
    says: [['SERA', 'I’d rather someone had arrived.']] }
] });

ch({ id: 'C10', m: 1.2, t: 'Who Stayed', p: [
  { art: 'c10-1', cap: 'A reception centre needed a corrected list before morning. Lena set a stop time. Sera, June, a clerk and I compared entries; Ivo came with a missing record from the airport. When June found her own mistake and the clerk snapped, Sera got there before I did.',
    says: [['ATC', 'Fight quietly. I have a headache.'], ['SERA', 'Then we check it again. We know which entries she handled. Start there.'], ['SERA', 'Then write who confirmed it. You won’t be on every call tomorrow.']] },
  { art: 'c10-2', cap: 'Mira came with two boxes from the bakery and a bill for part of the order, which Lena had told her the office would pay.',
    says: [['SISTER', 'The ones on the left are still good.'], ['SISTER', 'Those are also good. They’re just ugly.'], ['ATC', 'I feel represented.'], ['SISTER', 'And I need you to call me when you say you’ll call me. Sometimes I need an answer about something boring.']] },
  { art: 'c10-1', cap: 'Later June apologised again for the copied entry.',
    says: [['JUNE', 'I cost everyone time.']],
    ask: { k: 'june', q: 'What do you say to June?', opts: [{ v: 'specific', t: '"You found it. Put your name on the check that caught it."' }, { v: 'shared', t: '"I marked a movement completed last week. Sera caught it."' }, { v: 'abrupt', t: '"It’s done. Can we leave it?"' }] } },
  { art: 'c10-3', cap: 'Ivo had missed his lift and would not let me find him a taxi. Lena turned off one light; Sera turned off another. I remember that night because, for a few hours, I had wanted to be there. Not because there was nowhere else I could go.' }
] });

ch({ id: 'W01', m: 2, t: 'The Boxes at Westhaven', p: [
  { art: 'w01', cap: 'At the Westhaven reception hall Tomas was pushing a trolley through three queues. Lena had come for an arrivals report. He showed us boxes nobody could issue, because nobody had agreed which office had received them. I started counting boxes. He asked me to count the people who had been sent away once already.',
    says: [['TOMAS', 'They’re here. That doesn’t mean anyone can use them.'], ['ME', 'Who has to sign?'], ['TOMAS', 'Today? That’s what we’re finding out.']] }
], op: { sites: ['westhaven_port', 'westhaven_reception'], mo: 0.5, r: 50,
  brief: 'Westhaven: supplies held at the reception hall while the offices argue, and a report of pressure on the coast. Keep the airport flying for the people waiting, and ask the military to cover the harbour.',
  tasks: [{ k: 'flights', at: 'westhaven_airport', n: 6, t: 'Keep Westhaven Airport flying: 6 landings in a day', keep: true },
    { k: 'ask', at: 'westhaven_port', unit: 'shorad', h: 3, t: 'Ask for a short-range battery over the harbour' }],
  raid: { name: 'coast raid', h: [6, 20], warn: 40, intel: 'Drones gathering off the coast, towards Westhaven.', hits: [{ bat: 'dr_senitz', n: 6, at: 'saga:westhaven_port' }] } },
after: res('W01', 'w01', 'The supplies were released and the hall stayed open. A tired passenger complained about the queue. Tomas let them finish.',
  'Some of the stock was held another week. Tomas told me who was still waiting, by name.',
  'The issue was suspended. We moved the people who needed it to the airport’s hall instead. They were still waiting there the next week.') });

ch({ id: 'W02', m: 3, t: 'Two Fields, One Weather', p: [
  { art: 'w02', cap: 'A dispatcher asked whether Corbin could take two diverted services. The summary said yes. A worker at the field said a service there was still being restored. Sera, still junior, asked which answer belonged at the family desk. I nearly told her to use the summary. Then I called the field.',
    says: [['SERA', 'They’re going to travel there if we say yes.'], ['ME', 'I’m checking.'], ['SERA', 'Then that’s what I’ll tell them.']] }
], op: { sites: ['ashford_airport', 'corbin_airport'], mo: 0.5, r: 50,
  brief: 'Weather over the capital and a runway closed for repairs: Ashford and Corbin must share the day. Keep both open and Corbin flying.',
  tasks: [{ k: 'open', at: 'ashford_airport', t: 'Keep a runway open at Ashford', keep: true }, { k: 'open', at: 'corbin_airport', t: 'Keep a runway open at Corbin', keep: true },
    { k: 'flights', at: 'corbin_airport', n: 8, t: 'Land 8 flights a day at Corbin' }],
  raid: { name: 'drone raid on Corbin', h: [8, 24], warn: 40, intel: 'Drones launched from Salik, heading south.', hits: [{ bat: 'dr_salik', n: 4, at: 'saga:corbin_airport' }] } },
after: res('W02', 'w02', 'The diversions landed where there was room. Ashford stayed short of a runway; it did not reset to full.',
  'One flight held and went farther. The families were told the truth, and needed buses.',
  'We closed Corbin to arrivals and dealt with the backlog. Nobody crashed to punish us for being careful.') });

ch({ id: 'C11', m: 4, t: 'East Bank', p: [
  { art: 'c11-1', cap: 'The first winter. Lena took me to East Bank Hospital by the service entrance. A woman in work clothes was arguing with a driver about three bags against a fire door. Rose Pelling, laundry supervisor.',
    says: [['ROSE', 'If you leave them there, someone will move them somewhere you won’t find them.'], ['APT', 'He’s meant to tell me what the civil side can actually confirm.'], ['ROSE', 'Then he can start with when the clean linen’s coming. Don’t write “linen” and think you’ve got it. Come and look.']] },
  { art: 'c11-2', cap: 'Heat, damp air, and a machine with one panel off. Amal knelt beside it. I asked about total capacity. Rose answered, then pointed at a woman sorting bundles by hand.',
    says: [['ROSE', 'That’s her extra hour. She has a bus at five. Your total includes her missing it.'], ['ME', 'How often?'], ['ROSE', 'Ask her.']],
    ask: { k: 'marit', q: 'Rose says to ask her.', opts: [{ v: 'asked', t: 'Ask her name, and what the change would mean for her' }, { v: 'work', t: 'Stay with the operational question' }] } },
  { art: 'c11-3', cap: 'In the waiting area a boy was fighting the zip of a red bag. I asked if he wanted a hand. He held it out, then changed his mind, and did it himself.',
    says: [['BOY', 'It’s eaten the lining.'], ['BOY', 'There.']] },
  { art: 'c11-4', cap: 'The plan showed the hospital and Lowen Junction, which carries its power and its roads, as two protection areas. Keeping the building standing was not the whole problem.',
    says: [['ROSE', 'We keep saying that.'], ['APT', 'Then we’ll put both in the request.'], ['ROSE', 'And when they tell you it can’t be both?'], ['APT', 'I’ll come back.']] }
] });

ch({ id: 'W03', m: 4, t: 'The Road People Use', p: [
  { art: 'w03', cap: 'Mira met me beside a delivery van that was late for reasons everyone knew and nobody had written down. The driver described the detour over the Tarn Pass viaduct, and the customer who could not collect bread when the bus stopped running. I asked about the bridge’s capacity. Mira told me to finish listening to the route first.',
    says: [['SISTER', 'You keep drawing a line round it.'], ['ME', 'I need to know what still gets through.'], ['SISTER', 'Then ask what was meant to come back as well.']] }
], op: { sites: ['tarn_viaduct', 'tarn_pass', 'hollin'], mo: 0.5, r: 60,
  brief: 'The road over the Tarn Pass viaduct is Hollin’s way out. Rockets have been fired at the pass before. Keep the road open, and ask for cover over the viaduct.',
  tasks: [{ k: 'road', at: 'tarn_viaduct', r: 80, t: 'Keep the road over the viaduct open', keep: true },
    { k: 'ask', at: 'tarn_viaduct', unit: 'shorad', h: 4, t: 'Ask for a short-range battery over the viaduct' }],
  raid: { name: 'rockets on the pass', h: [10, 30], warn: 25, intel: 'Rocket launchers moving up behind the ridge.', hits: [{ bat: 'ra58', n: 8, at: 'saga:tarn_viaduct' }] } },
after: res('W03', 'w03', 'Traffic kept moving under limits. Mira still lost some trade, and the road was not safe forever.',
  'The detour worked, slowly. The fuel, the staff time and the missed journeys came with us into the next briefing.',
  'The road closed. We moved what we could the long way round. Mira was all right. Her customers waited.') });

ch({ id: 'W04', m: 5, t: 'The First Cold Rooms', p: [
  { art: 'w04', cap: 'Rose answered my call while putting on another layer. Staff were asking whether to bring their relatives to work, where it was warm. The system showed a restoration time for the power. She asked who had entered it.',
    says: [['ROSE', 'Was that an estimate, or did someone just need a number?'], ['ME', 'I’ll ask.'], ['ROSE', 'Ask before I send it round.']] }
], op: { sites: ['kessock_power', 'east_bank', 'ashford_power'], mo: 0.5, r: 50,
  brief: 'Cold weather, and the power stations that feed East Bank are worn. Ask for a battery over Ashford Power Station.',
  tasks: [{ k: 'ask', at: 'ashford_power', unit: 'shorad', h: 4, t: 'Ask for a short-range battery over Ashford Power Station' }],
  raid: { name: 'power station raid', h: [8, 24], warn: 40, intel: 'Cruise missiles fuelled at the coast; their targets are power.', hits: [{ bat: 'cm30', n: 3, at: 'saga:kessock_power' }, { bat: 'dr_senitz', n: 4, at: 'saga:ashford_power', t: -200 }] } },
after: res('W04', 'w04', 'Limited service came back. The staff still needed relief; the power did not give them their energy back.',
  'Some wards stayed cold. We published the new limit and carried the rest forward.',
  'We moved patients to where there was power, along the roads that were open. Rose sent the new limit round herself.') });

ch({ id: 'C12', m: 6, t: 'Green Boxes', p: [
  { art: 'c12-1', cap: 'An airfield asked for a replacement radio. The summary said it had been replaced last month and was working. I sent the request back with a question. It came again with a photograph of a sealed box in a cupboard.',
    says: [['ME', 'Have they fitted it or not?'], ['APT', 'Ask the person who has to use it.'], ['ELIAN', 'The replacement came. The fitting kit didn’t. We’ve been using the old unit. I wrote what I had.']] },
  { art: 'c12-2', cap: 'Elian showed us the unopened kit, the patched old unit and a log of every interruption. The supplier was Arden Civic Systems. Their green mark meant they had met a reporting milestone; the summary showed it as ready. Sera asked whether the forms underneath used the same word. They did not.',
    says: [['ELIAN', 'We haven’t just sat here.'], ['ME', 'I should have checked before I sent it back.'], ['ELIAN', 'All right.']] },
  { art: 'c12-2', cap: 'I began a small register: the source record, what the summary claimed, who was responsible, the correction asked for. A few entries. Not a wall of string.' }
] });

ch({ id: 'W05', m: 6, t: 'Still in the Box', p: [
  { art: 'w05', cap: 'Elian came to the Arden yard to collect a fitting kit. It existed, but it had been allocated twice on paper. An administrator wanted me to sign the handover so the driver could leave.',
    says: [['ELIAN', 'If I take this one, who thinks they’ve still got it?'], ['ADMIN', 'We’ll correct that afterwards.']],
    ask: { k: 'w05', q: 'The administrator holds out the handover.', opts: [{ v: 'once', t: '"Put the correction on the handover." Allocate it once.' }, { v: 'sign', t: 'Sign now. The driver has another delivery.' }] } }
], op: { sites: ['corbin_works', 'arden_yard'], mo: 0.4, r: 50,
  brief: 'A fitting kit allocated twice. Hand it over once, honestly, and keep Corbin’s works covered while you do.',
  tasks: [{ k: 'pick', if: 'w05=once', t: 'Hand the kit over once, with the correction on the form' },
    { k: 'ask', at: 'corbin_works', unit: 'shorad', h: 3, t: 'Ask for a short-range battery over Corbin Motor Works' }],
  raid: { name: 'raid on Corbin’s works', h: [8, 24], warn: 40, intel: 'Drones towards Corbin, low.', hits: [{ bat: 'dr_senitz', n: 4, at: 'saga:corbin_works' }] } },
after: res('W05', 'w05', 'The repair went ahead with an honest inventory. Another field still needed a part.',
  'We found a substitute and a later slot, and wrote both down.',
  'The repair waited. Elian’s staff made do. The green summary did not get to say it was fixed.') });

ch({ id: 'I1', m: 6.4, t: '22:34, the First March', p: [
  { art: 'i2234-1', cap: 'Fourteenth of March, late. I was the last one in, with Sera finishing a handover. The scanner on the shelf played the civil frequencies low. At 22:34 it went silent. Not static: every frequency at once, nobody speaking. I thought it had broken.',
    says: [['SERA', 'Leave it. It’s a minute.'], ['ME', 'For what?'], ['SERA', 'Northline. Fourteenth of March.'], ['ME', 'I know what Northline was.'], ['SERA', 'Everyone knows where they were when they heard. I wasn’t born. I’ve been told where I was.']] },
  { art: 'i2234-1', cap: 'The minute ended. A pilot somewhere asked for a level change, as if nothing had happened. Every year there was a minute, and every year I was surprised by it. I thought that was because I was busy.' }
] });

ch({ id: 'W06', m: 7, t: 'The Other Runway', p: [
  { art: 'w06', cap: 'June asked whether the closure message should go now or after a repair estimate. I remembered how many people had travelled on an assumed reopening. Lena gave me a confirmed engineering limit and asked me to make a plan with it.',
    says: [['JUNE', 'They’ll be angry if we cancel.'], ['APT', 'They can be angry somewhere they can actually land.'], ['ME', 'Give me the fields that are available now.']] }
], op: { sites: ['ashford_airport', 'corbin_airport', 'westhaven_airport'], mo: 0.5, r: 50,
  brief: 'A warning of ballistic missiles towards the capital’s airport. Keep a runway open somewhere for every flight, and stands free at Corbin for diversions.',
  tasks: [{ k: 'open', at: 'ashford_airport', t: 'Keep a runway open at Ashford', keep: true }, { k: 'open', at: 'corbin_airport', t: 'Keep a runway open at Corbin', keep: true },
    { k: 'stands', at: 'corbin_airport', n: 3, t: 'Keep 3 stands free at Corbin for diversions' }],
  raid: { name: 'missiles on Ashford', h: [6, 18], warn: 12, intel: 'Ballistic launchers raised at their bases. Ashford International is in reach.', hits: [{ bat: 'mb2a', n: 2, at: 'apt:capital' }] } },
after: res('W06', 'w06', 'Ashford held, or Corbin took what it could not. We kept the plan that made that possible.',
  'Some flights went elsewhere. Their passengers and the ground crews felt it for days.',
  'A runway stayed closed and we ran the airports without it.') });

ch({ id: 'C13', m: 8, t: 'The Version They Kept', p: [
  { art: 'c13-1', cap: 'A review team asked me to confirm the sequence of the day of the strike. I had agreed to a private review and could stop it. I expected it to be difficult. I did not expect the gap: the recording went from the alarm to Ivo taking over.',
    says: [['ME', 'Play that part again.'], ['ME', 'There’s more.'], ['VOICE', 'It’s an extract.'], ['ME', 'Then where is the rest?']] },
  { art: 'c13-1', cap: 'Staff-welfare restrictions had been put on part of it. Ivo had asked for them. The full source had been kept. I heard myself ask if she could hear me after the call had ended. I heard how long it took me to answer.',
    says: [['ME', 'I want the source preserved. All of it. In the account as well.']] },
  { art: 'c13-2', cap: 'I found Ivo at the old airfield, mending a coat hook that kept turning in the wall.',
    says: [['ME', 'You signed it.'], ['ATC', 'Yes. I wanted you to have a week without hearing yourself asking for her.'], ['ATC', 'I’ve seen what a recording does to a man when they play it in a room full of strangers. Until his voice isn’t his any more.'], ['ME', 'Whose?'], ['ATC', 'He’s dead. I was sitting next to him.'], ['ATC', 'I haven’t seen anything that says what you did caused that strike or could have stopped it.']],
    ask: { k: 'ivo', q: 'What do you ask Ivo to do now?', opts: [{ v: 'formal', t: 'Put his name to a correction, and say why' }, { v: 'distance', t: 'Keep him out of it. I’ll get the source included' }, { v: 'public', t: 'Say in public how the record was changed' }] } }
] });

ch({ id: 'W07', m: 8, t: 'A Shift Without Ivo', p: [
  { art: 'w07', cap: 'Ivo was not on my next shift. He had a proper reason on the rota. I caught myself treating it as a message. June asked who could sign off an old entry. I nearly said Ivo.',
    says: [['JUNE', 'Did I ask the wrong thing?'], ['ME', 'No. I was looking for the wrong person.'], ['JUNE', 'Who do I ask now?']] }
], op: { sites: ['ashford_airport', 'area_centre'], mo: 0.5, r: 50,
  brief: 'A shift without Ivo. Keep Ashford’s service flying, and ask for a radar over the Northern Area Centre, which the drones have been looking at.',
  tasks: [{ k: 'flights', at: 'ashford_airport', n: 10, t: 'Land 10 flights a day at Ashford' },
    { k: 'ask', at: 'area_centre', unit: 'mr3d', h: 4, t: 'Ask for a radar at the Northern Area Centre' }],
  raid: { name: 'drones over the north', h: [8, 24], warn: 40, intel: 'Drones over the ridge, towards Fort Ashby.', hits: [{ bat: 'dr_salik', n: 6, at: 'saga:area_centre' }] } },
after: res('W07', 'w07', 'The shift worked without needing anyone to make up. Someone else was allowed to be good at it.',
  'One task waited, and we wrote down that it was waiting.',
  'We declared a limit and worked inside it. The office did not fall apart because one man was not there.') });

ch({ id: 'W08', m: 9, t: 'The Room That Waited', p: [
  { art: 'w08', cap: 'The old Northern Area Centre had too many chairs and not enough working sockets. Ivo knew where a records cabinet used to stand. I wanted to know whether the room could be used next week. We talked about the room, because neither of us could talk about the recording yet.',
    says: [['ATC', 'That wall was different.'], ['ME', 'Does it matter for the equipment?'], ['ATC', 'No. I was just saying.']],
    ask: { k: 'w08', q: 'The summary already counts the old centre as a backup.', opts: [{ v: 'tested', t: 'Test it with real traffic before counting it' }, { v: 'counted', t: 'Count it. There isn’t time.' }] } }
], op: { sites: ['area_centre', 'capital_annex'], mo: 0.4, r: 50,
  brief: 'The old centre is to be the civil backup. Test it before anyone relies on it, and keep the capital flying meanwhile.',
  tasks: [{ k: 'pick', if: 'w08=tested', t: 'Test the backup with a share of the traffic' }, { k: 'flights', at: 'ashford_airport', n: 8, t: 'Land 8 flights a day at Ashford' }],
  raid: { name: 'missiles on the north', h: [10, 30], warn: 40, intel: 'Cruise missiles towards the ridge.', hits: [{ bat: 'cm30', n: 2, at: 'saga:area_centre' }] } },
after: res('W08', 'w08', 'The backup took the test. It kept its staff, its limits and its list of repairs.',
  'We used only what we had proved worked. Nobody called it national resilience.',
  'The trial failed, and we kept the main service and fixed what had gone wrong.') });

ch({ id: 'X1', m: 9.5, t: 'The Board', pre: ['stage:3'], p: [
  { art: 'x1-1', cap: 'The old centre in its second week. June was labelling cables. Gen. Mara Voss, Chief of Defence, walked the length of the long room without taking her coat off and stopped where the old plotting board had hung.',
    says: [['CDS', 'Who runs this room?'], ['JUNE', 'He does. Sort of.'], ['CDS', 'This building has the old lines north. Every radar between here and the ridge can be seen from that wall. I want a picture. I’ve been told you’re the man who says when two reports disagree.'], ['ME', 'Who told you that?'], ['CDS', 'People who were annoyed by it.']] },
  { art: 'x1-2', cap: 'She asked what was on the ground at Corbin. I read the field’s own log, not the summary: one runway open, the second shown open nationally and closed for lighting work.',
    says: [['CDS', 'Which one would you put a fighter on?'], ['ME', 'Neither, if you’re asking me. I’m not the one who knows what a fighter needs.'], ['CDS', 'That’s the right answer. It’s not the one I usually get.'], ['CDS', 'You’ll recommend. I’ll decide. When I don’t take your recommendation, I’ll tell you why.']] },
  { art: 'x1-3', cap: 'At the end of the side corridor was a door with a number painted over again and again: Sector 9. I had worked with Ivo for four years by then. I did not know he had worked in that building.',
    says: [['ME', 'What’s in there?'], ['ATC', 'Records. Old ones. It’s damp. Nothing works in there. Leave it.']] }
] });

ch({ id: 'X1N', m: 9.8, t: 'The First Night', sceneAt: 'warn', pre: ['unit:shorad@westhaven_port'], fx: ['stage:4'], p: [
  { art: 'x1-4', cap: 'Three weeks later, the joint cell’s first real night. Col. Ashe sat on the weapons side; June on the civil side, because she had asked to. Drones came in low off the sea towards Westhaven. A ferry was inbound. A club aircraft had filed a flight plan that afternoon and not closed it.',
    says: [['ADA', 'Westhaven battery has three tracks. Requesting free.']],
    ask: { k: 'x1free', q: 'A club aircraft is unaccounted for.', opts: [{ v: 'wait', t: '"Hold. June, call the club."' }, { v: 'now', t: '"Recommend free over Westhaven."' }] } },
  { art: 'x1-4', if: 'x1free=wait', cap: 'Seconds. The tracks were closer.',
    says: [['JUNE', 'It landed at four. They forgot to close the plan.'], ['ME', 'Civil side is clear. Recommend free over Westhaven.'], ['CDS', 'Free.']] },
  { art: 'x1-4', if: 'x1free=now', cap: 'Ashe looked at the phone in his hand. On the other end was Voss, at home.',
    says: [['CDS', 'Free.'], ['JUNE', 'It landed at four. They forgot to close the plan.']] }
], op: { sites: ['westhaven_port'], mo: 0.3, r: 50,
  brief: 'Drones off the coast towards Westhaven harbour. The battery over it is ready.',
  raid: { name: 'drones on Westhaven', h: 0.2, warn: 6, intel: 'Three low tracks off the sea, towards Westhaven.', hits: [{ bat: 'dr_senitz', n: 3, at: 'saga:westhaven_port' }] } },
after: [
  { art: 'x1-5', if: 'x1free=wait', cap: 'Morning. Voss read the log standing up, coat on.',
    says: [['CDS', 'You held for ninety seconds.'], ['ME', 'We didn’t know that for ninety seconds.'], ['CDS', 'From tonight: if this cell says free, I say free. If I disagree, you’ll hear it from me, not from the logs, and you’ll hear why. Don’t make me regret the ninety seconds.']] },
  { art: 'x1-5', if: 'x1free=now', cap: 'Morning. Voss read the log standing up, coat on.',
    says: [['CDS', 'You recommended fire with a civil aircraft unaccounted for. You were lucky. The standing order starts tonight anyway, because I need this room. Don’t spend the luck twice.']] },
  { art: 'x1-5', cap: 'I have been asked since whether I commanded the air defence. I did not. I said what was true about the sky, and someone who had the right to decide had promised to listen. For most of the war, that was the same thing. The nights it wasn’t are the ones I’m asked about.' }
] });

})(window.IC);
