/* Iron Canopy — incidents: the things that must jump out of a busy picture. An airliner leaving its route flashes
   and chimes; an unknown aircraft crossing into our airspace sounds a tone; anything firing a weapon sounds the
   alarm. Each incident sits in a short list with a button that takes you there. */
(function (IC) {
'use strict';
const U = IC.U;
const OFF = 50, BACK = 30;

function add(S, kind, ref, text, level) {
  const I = S.inc || (S.inc = { list: [], scanT: 0 });
  const old = I.list.find(x => x.ref === ref && x.kind === kind && !x.done);
  if (old) { old.t = S.time; old.text = text; return old; }
  const it = { id: IC.nid('inc'), kind, ref, text, level: level || 'warn', t: S.time, x: ref ? ref.x : 0, y: ref ? ref.y : 0 };
  I.list.unshift(it);
  if (I.list.length > 12) I.list.length = 12;
  if (level === 'alarm') { S.alarmFx = 1; IC.sfx && IC.sfx.alarm && IC.sfx.alarm(); }
  else if (kind === 'offroute') IC.sfx && IC.sfx.chime && IC.sfx.chime();
  else IC.sfx && IC.sfx.tone && IC.sfx.tone();
  IC.emit(S, 'incidentAdded', it);
  return it;
}
IC.incidentAdd = add;
IC.incidentDismiss = function (S, id) { const I = S.inc; if (!I) return; const it = I.list.find(x => x.id === id); if (it) it.done = true; };

IC.incidents = function (S, dt) {
  const I = S.inc || (S.inc = { list: [], scanT: 0 });
  if (S.alarmFx > 0) S.alarmFx = Math.max(0, S.alarmFx - dt * 0.02);
  I.scanT -= dt;
  if (I.scanT > 0) return;
  I.scanT = 5;
  for (const t of S.threats) {
    if (t.dead || !t.tn || !t.det) continue;
    // airliners (and anything squawking as one) that leave their filed route
    if (t.plan && (t.d.civil || t.disguise) && !t.appr) {
      const off = IC.offRoute(t);
      if (off > OFF) {
        t.offT = (t.offT || 0) + 5;
        if (t.offT >= 20 && !t.offFlag) { t.offFlag = true; add(S, 'offroute', t, `${t.cs || 'TN ' + t.tn} is ${U.km(off)} off its route${t.jammed ? ' (GPS jamming)' : ''}`, 'warn'); IC.emit(S, 'offRoute', t); }
      } else if (off < BACK && t.offFlag) {
        t.offFlag = false; t.offT = 0;
        for (const it of I.list) if (it.ref === t && it.kind === 'offroute') it.done = true;
      }
    }
    // unknown or suspect aircraft entering our airspace
    if (!t.d.civil && (t.aff === 'U' || t.aff === 'S') && (t.d.cls === 'air' || t.d.cls === 'drone' || t.d.cls === 'ga') && !t.border && IC.inHome(t.x, t.y) && !t.intrudeFlag) {
      t.intrudeFlag = true;
      add(S, 'intrusion', t, `TN ${t.tn}: unidentified aircraft in our airspace near ${IC.nearestPlace(S, t.x, t.y)}`, 'warn');
    }
  }
  for (const it of I.list) {
    if (it.ref && (it.ref.dead || it.ref.gone)) it.done = true;
    if (!it.done && S.time - it.t > (it.level === 'alarm' ? 900 : 1800)) it.done = true;
    if (it.ref && !it.done) { it.x = it.ref.x; it.y = it.ref.y; }
  }
  I.list = I.list.filter(it => !it.done || S.time - it.t < 60);
};
IC.activeIncidents = S => S.inc ? S.inc.list.filter(x => !x.done) : [];

IC.on((S, type, d) => {
  switch (type) {
    case 'weaponRelease': add(S, 'launch', d, `${d.tn ? 'TN ' + d.tn : 'An aircraft'}${d.cs ? ' (' + d.cs + ')' : ''} has released weapons near ${IC.nearestPlace(S, d.x, d.y)}`, 'alarm'); break;
    case 'collision': add(S, 'collision', d.t, `MAYDAY: ${d.t.cs} mid-air collision ${d.place}`, 'alarm'); break;
    case 'violation': add(S, 'violation', d, `Foreign fighters inside our airspace near ${IC.nearestPlace(S, d.x, d.y)}`, 'warn'); break;
    case 'incident': add(S, d.kind, d.t, d.text, d.level || 'warn'); if (d.t) d.t.offFlag = true; break;
    case 'ballistic': add(S, 'ballistic', d, `Ballistic missile TN ${d.tn} in flight`, 'alarm'); break;
    case 'noRoute': add(S, 'ground', d.m, `${d.ap.name}: ${d.m.who || 'an aircraft'} has no taxi route to a runway`, 'warn'); break;
    case 'baseHit': if (!d.runway) add(S, 'runway', d.base, `${d.base.name}: runway closed`, 'alarm'); break;
  }
});

})(window.IC);
