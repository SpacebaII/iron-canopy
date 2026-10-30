/* Iron Canopy — (story v3) the chapters, part four: the fourth March, the fourth spring, the ceasefire and its four
   closing operations, and the ending (months 42 to 49). Plain data read by saga.js; see saga-y1.js for the fields. */
(function (IC) {
'use strict';
const ch = c => IC.SAGA.push(c);
const res = IC.sagaRes;

ch({ id: 'C27', m: 42.4, t: 'Another Departure', p: [
  { art: 'c27-1', cap: 'The fourteenth of March, the fourth of the war. 22:29, a line of storms over the ridge. A Tessk civil operator rang the cell’s civil desk on the old line north. Tessk Union Air had flown the ridge route since the partition and numbered it 3310 from the first day.',
    says: [['VOICE', 'Tessk Union 3310, two hundred and thirty-one aboard. Deviating north around weather. We have lost two-way contact with the aircraft. Its transponder is intermittent. Please acknowledge.']] },
  { art: 'c27-1', cap: 'The board showed a track over the ridge, turning north, and ahead of it the outline of R-9. The box. Our battery near Hollin was on standing Free from the last raid.',
    says: [['ADA', 'Unidentified track entering R-9 from the south-east. No reply on guard. Hollin battery has it.']] },
  { art: 'c27-2', cap: 'In the cabin a passenger stooped for a dropped pen, and a crew member helped lift a bag. 22:31. I was sitting where my father had sat. I did not know that yet. I knew the chair was old, and that the wall in front of me had been painted over twice.' },
  { art: 'c27-3', cap: '22:34. Every civil frequency in the country went silent for the minute. Nobody in the room spoke. The Hollin battery’s crew waited for the cell.',
    says: [['CDS', 'Not tonight. Civil side. Confirm.']],
    ask: { k: 'report', q: 'What do you tell the weapons side?', opts: [{ v: 'T', t: 'The whole report and its limits. "I recommend hold. I’m asking Lenz now."' }, { v: 'O', t: 'An unknown track. Leave out the operator’s call.' }, { v: 'F', t: '"The box is hot."' }] } },
  { art: 'c27-3', if: 'report=F', cap: 'I heard myself. The words came out in a voice I knew from somewhere I could not place.',
    says: [['APT', 'What confirms it?']],
    ask: { k: 'persist', q: 'Lena asks what confirms it.', opts: [{ v: 'no', t: 'Withdraw it, and give the whole report' }, { v: 'yes', t: 'Say it again' }] } },
  { art: 'c27-3', if: 'report=O', cap: 'The board said plainly what my report had left out of the assessment: a civil operator’s call, matching the route and the time.' }
], op: { sites: ['westhaven_airport'], mo: 0.15, result: 'fixed',
  brief: 'Tessk Union 3310, out of contact over the ridge. Keep a field open for it to come down at.',
  tasks: [{ k: 'open', at: 'westhaven_airport', t: 'Keep a runway open at Westhaven for the diversion', keep: true }] },
fx: [{ if: 'report=F & persist=yes', fx: ['tu3310=lost'] }, { if: '!tu3310', fx: ['tu3310=landed'] }, { if: 'route=A|B', fx: ['stage:8'] }],
after: [
  { art: 'c27-landed', if: 'tu3310=landed', cap: 'It came down at Westhaven. Lenz rang afterwards.',
    says: [['LENZ', 'They landed.'], ['ME', 'All of them?'], ['LENZ', 'All of them. One of them is complaining about the coffee.'], ['LENZ', 'It was the fourteenth. Tonight.'], ['ME', 'I know.'], ['LENZ', 'For Pavel, then.']] },
  { art: 'c27-landed', if: 'tu3310=landed & report!=T', cap: 'Other people had prevented it. The review recorded what I had passed on, and what I had not. A lucky outcome did not turn it into the right answer.' },
  { art: 'c27-lost', if: 'tu3310=lost', cap: 'The battery fired on the cell’s word. There was no call from Lenz that night. A week later there was one, formal and correct, with nothing under the signature.' },
  { art: 'c27-landed', cap: 'For a moment I wanted someone to tell me that this was what the other night would have looked like. Nobody could.' }
] });

ch({ id: 'W24', m: 44, t: 'The Fourth Spring', p: [
  { art: 'w24', cap: 'The morning after. Reyes asked for the same kind of civil adjustment I had first handled years before. Mira sent a photograph of a mixer finally mended.',
    says: [['AIR', 'What can the civil side carry?'], ['ME', 'I’ll tell you what we’ve confirmed.'], ['AIR', 'Good. That’s the bit I can use.']] }
], op: { sites: ['selby_base', 'corbin_airport', 'ironbridge_works'], mo: 0.5, r: 60,
  brief: 'The rear: Selby, Corbin and Ironbridge. Keep Corbin open with room for both services.',
  tasks: [{ k: 'open', at: 'corbin_airport', t: 'Keep a runway open at Corbin', keep: true }, { k: 'stands', at: 'corbin_airport', n: 4, t: 'Keep 4 stands free at Corbin' }, { k: 'flights', at: 'corbin_airport', n: 8, t: 'Land 8 flights a day at Corbin' }],
  raid: { name: 'spring raid on the rear', h: [8, 24], warn: 40, intel: 'Drones from Salik, south towards Selby.', hits: [{ bat: 'dr_salik', n: 8, at: 'saga:selby_base' }] } },
after: res('W24', 'w24', 'A limited success that belonged to several people. There was still work left.',
  'A reduced service and a repair schedule went on.',
  'The armistice would begin from a harder place. Not from the beginning.') });

/* ---------- the ceasefire ---------- */
ch({ id: 'R01', m: 47, t: 'A Ceasefire Is a Message', p: [
  { art: 'r01', cap: 'The proposed ceasefire time reached one office before the confirmed notice reached another. June had a civil movement waiting for a clear answer. Ivo was not at the old position; a colleague had it, and Ivo was there only in the way his recovery allowed.',
    says: [['JUNE', 'I have two messages with the same heading.'], ['ME', 'Which one has been confirmed?'], ['JUNE', 'That’s why I’m calling.']] },
  { art: 'r01', cap: 'When the confirmed notice came and June read it back, the radio carried the Prime Minister. Oren Valk’s voice: careful, decent, tired.',
    says: [['PM', '...from midnight, our forces will hold. I ask the other side to confirm.']] }
], pre: ['ceasefire'], op: { sites: ['tarn_pass', 'elk_pass', 'area_centre', 'ashford_airport'], mo: 0.3,
  brief: 'The ceasefire, from midnight. Keep the civil closures and permissions the same in every office: Ashford open, the road at Tarn Pass open.',
  tasks: [{ k: 'open', at: 'ashford_airport', t: 'Keep a runway open at Ashford', keep: true }, { k: 'road', at: 'tarn_pass', r: 80, t: 'Keep the road at Tarn Pass open', keep: true }] },
after: res('R01', 'r01', 'The quiet period began, everywhere at once. Somebody said they could finally go home. Somebody asked who had the next shift.',
  'The start was ragged in places, and the civil plan stayed reduced while it settled.',
  'The start was disputed. We reported it as one event, and kept the reduced plan.') });

ch({ id: 'R02', m: 48, t: 'The First Limited Service', p: [
  { art: 'r02', cap: 'Lena gave me the proposed first service. It was smaller than the announcement Halloran’s office would have liked.',
    says: [['ME', 'They’re going to call that reopening?'], ['APT', 'They’re going to call it whatever they like. We have to tell people where they can go.']] }
], op: { sites: ['ashford_airport', 'corbin_airport'], mo: 0.4,
  brief: 'The first limited civil service of the peace. Run it where the capacity is real.',
  tasks: [{ k: 'open', at: 'ashford_airport', t: 'Keep a runway open at Ashford', keep: true }, { k: 'flights', at: 'ashford_airport', n: 6, t: 'Land 6 flights a day at Ashford' }] },
after: res('R02', 'r02', 'At reception Tomas had to tell a passenger she could not take all her luggage. “You said it was running.” “It is. This one bag can’t go on it.” I started to step in. He was handling it. I let him finish.',
  'The first slot moved. We said why, and carried the backlog.',
  'The first advertised service did not run. We gave people a date we could keep.') });

ch({ id: 'R03', m: 48.1, t: 'The Returns List', p: [
  { art: 'r03', cap: 'Mira asked whether the road to Hollin was open. This time I answered before I tried to give her the whole picture.',
    says: [['ME', 'Part of it. The rest needs the route they’re checking today.'], ['SISTER', 'Then say that on the notice.']] },
  { art: 'r03', cap: 'Ostrand’s hall still had people in it. One resident refused to leave for a place he had not seen.',
    says: [['VOICE', 'I’m not going because the list says I am.'], ['ME', 'All right. Tell me what needs checking.']] }
], op: { sites: ['hollin', 'tarn_viaduct', 'ostrand'], mo: 0.4,
  brief: 'The first coaches north to Hollin. Keep the road over the viaduct and into the town open.',
  tasks: [{ k: 'road', at: 'tarn_viaduct', r: 80, t: 'Keep the road over the viaduct open', keep: true }, { k: 'road', at: 'hollin', r: 80, t: 'Keep the road into Hollin open', keep: true }] },
after: [
  { art: 'r03', if: 'R03=success|partial', cap: 'The first coach north. Mira, Ana and Luka were on it, the scales on Mira’s lap. I was not; I had a handover to finish. Mira rang from the square that night.',
    says: [['SISTER', 'The ovens still work. The note’s still on the door. Somebody’s put flowers on the stone.'], ['ME', 'Somebody?'], ['SISTER', 'Half the town. It’s March.']] },
  { art: 'r03', if: 'R03=failure', cap: 'The coaches waited for the road. Some people could not go home yet. They had a named destination and an office responsible for them, which is not the same thing.' }
] });

ch({ id: 'R04', m: 48.2, t: 'The Record Under Load', fx: ['stage:9'], p: [
  { art: 'r04-1', cap: 'The old centre, late, the cell half packed for the handover. Ivo had come in a wheelchair, against advice, with a nurse who waited in the long room. Sector 9. I used the key. A damp room, a row of grey lockers, one with a newer padlock. A reel of tape in a sealed bag, a log book stuck at the edges, and a photograph of two men at a console in this building.',
    says: [['ME', 'That’s you.'], ['ATC', 'That’s me. Twenty-six.']] },
  { art: 'r04-photo', cap: 'I looked at the other man for a long time.',
    says: [['ATC', 'Your father.'], ['ATC', 'Fourteenth of March. He cleared Northline north round the storm because the military line said the range was cold. The range was cold. The drone had been cancelled at ten past ten. The battery was told. The computer wasn’t.'], ['ATC', 'They have their tape. A battery commander asking for confirmation. Our liaison giving it. Each half is true. Each half is a lie on its own.']] },
  { art: 'r04-flash', cap: 'Thirty-four years before, at 22:34.',
    says: [['IVO26', 'When the missiles went, your father wouldn’t let go of the microphone. He kept calling them. I put my hand on his and said, “I’ve got it.”'], ['ATC', 'I said it to you, that day at the airport. Same words. You didn’t let go either.'], ['ATC', 'They played his tape in a room full of strangers until there was nothing left of him but the tape. I wasn’t going to watch it happen twice. Nobody did it alone. That’s the only thing I know for certain.']] },
  { art: 'r04-flash', cap: 'I said earlier that I had never heard those words before. I had. My father said them in his sleep. "The box is hot." I was four, and I thought it was about the oven.' },
  { art: 'r04-2', cap: 'Lena put the accurate record beside the institutional draft. Halloran’s office had offered me continued purpose. The price was in the proposed account: an implication against June it could not support.',
    says: [['APT', 'Read the parts about you.'], ['ME', 'I’ve read them.'], ['APT', 'Then don’t answer the other question.']],
    ask: { k: 'account', q: 'The war record:', opts: [{ v: 'accurate', t: '"Put the source with it. The part that makes me look worse too."' }, { v: 'private', t: 'The accurate record, kept private where it is mine' }, { v: 'protective', t: 'Sign the protective account. It names June.' }] } },
  { art: 'r04-2', if: 'account=protective', cap: '',
    says: [['ME', 'She worked with Sera.'], ['APT', 'So did you.']] },
  { art: 'r04-2', cap: 'And Northline’s half, from the locker.',
    ask: { k: 'northline', q: 'The log and the tape from Sector 9:', opts: [{ v: 'joint', t: 'Both halves, ours and theirs, to a joint commission' }, { v: 'ours', t: 'Our half only, with the record' }, { v: 'seal', t: 'Seal the locker again' }] } }
] });

ch({ id: 'E01', m: 49.5, t: 'The Door', p: [
  { art: 'e01a-1', if: 'account!=protective & tu3310!=lost', cap: 'Rina came, because I had asked her and she had agreed. She brought the copied photographs.',
    says: [['ME', 'She was leaving me. Before the airport. She’d decided.'], ['RINA', 'Yes.']] },
  { art: 'e01a-1', if: 'account!=protective & tu3310!=lost & depart=space|repair', cap: '',
    says: [['ME', 'She asked for space. We hadn’t worked out what came after. We were going to talk on Saturday.'], ['RINA', 'She told me.']] },
  { art: 'e01a-stone', if: 'account!=protective & tu3310!=lost & northline=joint', cap: 'Hollin, the square, a bright cold morning. Ana held the bread this time. Lenz stood a little apart, in a dark coat, his hat in his hand.',
    says: [['SISTER', 'Emil.'], ['SISTER', 'They couldn’t carve it. They couldn’t leave him off. So they left it blank and everybody knew.'], ['ME', 'I didn’t.'], ['SISTER', 'You were four.']] },
  { art: 'e01a-stone-no-lenz', if: 'account!=protective & tu3310!=lost & northline=ours|seal', cap: 'Hollin, the square, a bright cold morning. Ana held the bread this time.',
    says: [['SISTER', 'Emil.'], ['SISTER', 'They couldn’t carve it. They couldn’t leave him off. So they left it blank and everybody knew.'], ['ME', 'I didn’t.'], ['SISTER', 'You were four.']] },
  { art: 'e01a-stone', if: 'account!=protective & tu3310!=lost & northline=joint', cap: 'I had been looking for the one person who knew. There wasn’t one. There were a lot of people who each knew a little, and a room that had been told, and a computer that hadn’t. Along the ridge, the warning beacons of R-9 went out, one by one.' },
  { art: 'e01a-2', if: 'account!=protective & tu3310!=lost', cap: 'At home I put food on the table for someone who had chosen to visit. For a long time, I thought the next answer would change the last one. It didn’t.' },
  { art: 'e01b-1', if: 'account=protective | tu3310=lost', cap: 'June asked to see me, after she was moved from her post pending an inquiry into what I had signed. I heard her name through the door.',
    says: [['ME', 'Tell her it’s being reviewed.']] },
  { art: 'e01b-lock', if: 'account=protective | tu3310=lost', cap: 'The locker in Sector 9 had a new padlock. My signature was on the form that sealed it.' },
  { art: 'e01b-2', if: 'account=protective | tu3310=lost', cap: 'At the next briefing a junior employee pointed out a discrepancy.',
    says: [['ME', 'Just change it.']] },
  { art: 'e01b-3', if: 'account=protective | tu3310=lost', cap: 'The next March, at 22:34, the scanner in my office went silent. I went on talking through the minute. The employee waited for it to end before answering. The airport reopened on a Monday. The sentence is accurate and almost empty.' }
] });

})(window.IC);
