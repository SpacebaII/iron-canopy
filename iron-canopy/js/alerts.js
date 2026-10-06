/* Iron Canopy — the alert queue (brief 26). One list of what needs the player, sorted by how soon, of which at most
   IC.ALERT_MAX are on screen at once (a decision card counts as one). Nothing informational interrupts: status
   (jamming, a raid's size, how many more are waiting) is one quiet line, and everything is in the Journal. Headless:
   the page draws what IC.alertQueue returns, and the tests count it.
     IC.ALERT_PRI             3 now (an impact, a weapon released, a mayday, something hit), 2 act (out of missiles,
                              a runway closed, holding, a warning), 1 info (never shown as an alert)
     IC.alertPush(S, kind, tag, msg, at)   a log line that may need the player (IC.log calls it for leak and warn)
     IC.alertQueue(S)         { shown: [items], more: n waiting, status: [words], card: a decision is on screen }
     IC.alertDismiss(S, key)  the player waves one away (a condition stays away 10 game minutes unless it worsens) */
(function (IC) {
'use strict';
const U = IC.U;
IC.ALERT_MAX = 3;
IC.ALERT_TTL = { 3: 300, 2: 180 };
const PRI = { leak: 3, warn: 2 };
/* warnings that need nothing from the player: the status line says them */
IC.ALERT_QUIET = new Set(['SIRENS']);

IC.alertPush = function (S, kind, tag, msg, at) {
  const p = PRI[kind]; if (!p || IC.ALERT_QUIET.has(tag)) return;
  const Q = S._alq || (S._alq = []);
  // the same kind of news inside its life is one line that counts up, not a new pop-up
  const old = Q.find(x => x.tag === tag && x.pri === p && S.time - x.t < IC.ALERT_TTL[p]);
  if (old) { old.n++; old.t = S.time; old.msg = msg; old.at = at ? { x: at.x, y: at.y } : old.at; return; }
  Q.unshift({ key: `log:${tag}:${p}:${Math.round(S.time)}`, pri: p, tag, msg, n: 1, t: S.time, at: at ? { x: at.x, y: at.y } : null });
  if (Q.length > 30) Q.length = 30;
};
IC.alertDismiss = function (S, key) {
  const it = (S._alShown || []).find(x => x.key === key);
  if (it && it.inc) IC.incidentDismiss(S, it.inc);
  (S._alx || (S._alx = new Map())).set(key, { until: S.time + 600, n: it ? it.n || 1 : 1 });
};

/* everything that might be an alert now, each with its priority */
function gather(S) {
  const L = [], st = [];
  const add = (pri, key, tag, msg, at, o) => L.push(Object.assign({ pri, key, tag, msg, at: at || null, t: S.time, n: 1 }, o));
  // weapons that will land soon
  const bal = S.threats.filter(t => t.det && !t.dead && (t.d.cls === 'bal' || t.d.cls === 'hgv') && t.aff === 'H' && !t.decoyKnown);
  if (bal.length) {
    const t = bal.slice().sort((a, b) => IC.timeToImpact(a) - IC.timeToImpact(b))[0], tti = IC.timeToImpact(t);
    add(3, 'bal', bal.some(x => x.d.cls === 'hgv') ? 'HYPERSONIC' : 'BALLISTIC', `${bal.length} inbound, the first lands in ${U.dur(tti)} near ${IC.nearestPlace(S, t.x1 || t.aim.x, t.y1 || t.aim.y)}`, t, { tti, n: bal.length });
  }
  const arms = {};
  for (const t of S.threats) if (t.det && !t.dead && t.type === 'arm' && !t.blind && t.target) arms[t.target.name] = arms[t.target.name] || { t: IC.timeToImpact(t), u: t.target };
  for (const n in arms) add(3, 'arm:' + n, 'ANTI-RADAR MISSILE', `Coming at ${n}, ${U.dur(arms[n].t)} out. Switch its radar off`, arms[n].u, { tti: arms[n].t });
  // incidents: a mayday or weapons released is now, the rest needs an answer soon
  for (const it of IC.activeIncidents(S)) add(it.level === 'alarm' ? 3 : 2, 'inc:' + it.id, IC.INC_TAG[it.kind] || it.kind.toUpperCase(), it.text, it.ref && it.ref.tn ? it.ref : { x: it.x, y: it.y }, { t: it.t, inc: it.id, ref: it.ref });
  // things the player can fix
  const dry = S.units.filter(u => u.state === 'ready' && u.d.weapon === 'sam' && IC.activeMags(S, u).every(m => m.mag + m.store === 0));
  if (dry.length) add(2, 'dry', 'OUT OF MISSILES', `${dry.slice(0, 3).map(u => u.name).join(', ')}${dry.length > 3 ? ` and ${dry.length - 3} more` : ''}. Send stock from a depot`, dry[0], { n: dry.length, ref: dry[0] });
  const sus = S.threats.filter(t => t.det && !t.dead && t.aff === 'S' && IC.inHome(t.px, t.py) && t.d.cls === 'air');
  if (sus.length) add(2, 'sus', 'SUSPECT', `${sus.length} suspect aircraft in our airspace. Send a fighter to look`, sus[0], { n: sus.length, ref: sus[0] });
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && !b.locked && b.parts.some(p => p.kind === 'runway') && IC.rwyState(S, b).closed) add(2, 'rwy:' + b.id, 'RUNWAY CLOSED', `${b.name}: no runway can be used`, b, { ref: b });
  if (S.av) for (const b of S.infra) if (b.kind === 'airport' && b.owner === 'us') {
    const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id);
    if (hold.length >= 2 || hold.some(t => t.holdT > 600)) add(2, 'hold:' + b.id, 'HOLDING', `${b.name}: ${hold.length} airliner${hold.length > 1 ? 's' : ''} holding${hold.some(t => t.standShort) ? ', the stands are full' : ''}`, b, { n: hold.length, ref: b });
  }
  if (S.asp && S.asp.work > 1.05) add(2, 'atc', 'CONTROLLERS', `Overloaded: ${Math.round(S.asp.load)} flights’ work for ${S.asp.cap}. They space traffic wider and may miss a conflict`, null);
  const raid = S.threats.filter(t => t.det && !t.dead && t.aff === 'H' && !t.border && (t.d.cls === 'cm' || t.d.cls === 'drone' || t.d.cls === 'air') && IC.inHome(t.px, t.py));
  if (raid.length && S.airspace === 'open' && S.threats.some(t => t.d.civil && !t.dead && !t.hostileCiv)) add(2, 'civraid', 'AIRLINERS UP', 'Airliners are flying through a raid. Restrict the airspace to keep them clear (it costs charges)', null);
  // status, never an alert
  if (raid.length >= 4) st.push(`Raid: ${raid.length} hostile tracks`);
  const sir = IC.cities(S).filter(c => c.alert > 0);
  if (sir.length) st.push(`Sirens in ${sir.slice(0, 2).map(c => c.name).join(', ')}${sir.length > 2 ? ` and ${sir.length - 2} more` : ''}`);
  const jam = S.units.filter(u => u.jamF < 0.97 && u.radarOn);
  if (jam.length) st.push(`Jamming: ${jam.slice(0, 2).map(u => `${u.name} −${U.pct(1 - u.jamF)}`).join(', ')}`);
  // the log lines that need the player, while they are fresh
  if (S._alq) { S._alq = S._alq.filter(x => S.time - x.t < IC.ALERT_TTL[x.pri]); for (const x of S._alq) L.push(x); }
  return { L, st };
}
IC.INC_TAG = { offroute: 'OFF ROUTE', launch: 'WEAPONS RELEASED', intrusion: 'INTRUDER', collision: 'MAYDAY', violation: 'AIRSPACE VIOLATION', ballistic: 'BALLISTIC', ground: 'GROUND', runway: 'RUNWAY', separation: 'SEPARATION LOST', nearmiss: 'NEAR MISS', infringe: 'INFRINGEMENT' };

IC.alertQueue = function (S) {
  const { L, st } = gather(S), X = S._alx;
  // a dismissed one stays away for ten minutes, unless it has grown since
  const live = L.filter(x => {
    const d = X && X.get(x.key);
    if (!d) return true;
    if (S.time > d.until || (x.n || 1) > d.n) { X.delete(x.key); return true; }
    return false;
  });
  live.sort((a, b) => b.pri - a.pri || (a.tti != null && b.tti != null ? a.tti - b.tti : (a.tti != null ? -1 : b.tti != null ? 1 : b.t - a.t)));
  const card = !!(S.story && S.story.events.length);
  const room = Math.max(0, IC.ALERT_MAX - (card ? 1 : 0));
  const want = live.filter(x => x.pri >= 2);
  const shown = want.slice(0, room);
  S._alShown = shown;
  return { shown, more: want.length - shown.length, status: st, card };
};
})(window.IC);
