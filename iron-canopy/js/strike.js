/* Iron Canopy — counter-strikes (brief 78), headless. Between the enemy's waves the player can ask the Chief of
   Defence, Gen. Mara Voss, to strike across the border: a sector (the compass from our capital), a kind of target
   (their ballistic launchers, cruise missile launchers, drone sites, rocket artillery, aircraft at their bases, or
   their air defence), and a package she offers. The odds are worked out in the open (IC.strikeOdds): every jet over
   the target can be shot down by their air defence in the sector and their fighters, and every jet that gets there
   destroys a launcher with a chance that depends on whether we know where the launchers are. She pushes back on a
   package she thinks will cost too many crews for too little, and how far she goes with you is her trust in you
   (IC.trustOf CDS). The jets really fly: they take off from the base, cross the border and come back (air.js,
   mission 'xstrike'); the dice are rolled over the target (IC.strikeArrive). What dies there does not fire in the
   next wave (warplan.js counts live launchers). They answer: a strike on their soil brings their retaliation on. */
(function (IC) {
'use strict';
const U = IC.U, H = 3600;

IC.STRIKE = {
  // per jet over the target: the base risk, each of their air defence launchers covering it, each of their fighters near
  base: 0.03, sam: 0.06, ftr: 0.025, cap: 0.6,
  // an escort halves the fighters' part, radar hunters the air defence's
  escort: 0.5, sead: 0.5,
  // a jet that gets there destroys a launcher: we know where it is, or we hunt for it
  kill: 0.7, blind: 0.25,
  // strikes between two waves (one more at a trust of 70), and the trust a strike moves
  per: 1, perHigh: 2, high: 70,
  // the farthest a fighter flight goes and comes back from, as a share of its endurance at cruise
  reach: 0.42
};
IC.STRIKE_PKG = [
  { k: 'small', name: 'Two jets', jets: 2, escort: 0, sead: false, words: 'two jets, in and out low' },
  { k: 'standard', name: 'Four jets and an escort', jets: 4, escort: 2, sead: false, words: 'four strike jets with two fighters to keep theirs off' },
  { k: 'heavy', name: 'Six jets, escort and radar hunters', jets: 6, escort: 2, sead: true, words: 'six strike jets, two fighters and a pair hunting their radars first' }
];

const S0 = S => S.strike || (S.strike = { n: 0, cur: [], log: [], wave: -1, used: 0, insist: 0 });
const alive = B => B.L.filter(l => !l.dead);
const known = (S, B, l) => l.tel ? l.known : !!B.seen;
/* the batteries in a sector, of a kind */
IC.strikeTargets = (S, sec, grp) => S.wp ? Object.values(S.wp.bats).filter(B => B.grp === grp && IC.wpSector(S, B.x, B.y) === sec && alive(B).length) : [];
/* what one strike can reach: the battery of that kind in the sector we know most about (the nearest to our bases
   if we know of none), and any others of the kind within 60 km of it */
IC.strikeFocus = function (S, sec, grp) {
  const L = IC.strikeTargets(S, sec, grp);
  if (!L.length) return null;
  const nk = B => alive(B).filter(l => known(S, B, l)).length;
  const base = IC.mainBase(S) || IC.cap(S);
  const main = L.slice().sort((a, b) => nk(b) - nk(a) || U.dist(a, base) - U.dist(b, base))[0];
  return { main, bats: L.filter(B => B === main || U.dist(B, main) < 600), rest: L.filter(B => B !== main && U.dist(B, main) >= 600) };
};
/* every sector with something of theirs in it, and what we know is there */
IC.strikeSectors = function (S) {
  const out = [];
  if (!S.wp) return out;
  for (const k of IC.WP_SECTORS) {
    const bats = Object.values(S.wp.bats).filter(B => IC.wpSector(S, B.x, B.y) === k);
    if (!bats.length) continue;
    const g = {};
    for (const B of bats) {
      const e = g[B.grp] || (g[B.grp] = { n: 0, known: 0, bats: 0 });
      const L = alive(B); e.n += L.length; e.bats++; e.known += L.filter(l => known(S, B, l)).length;
    }
    out.push({ k, name: IC.wpSectorWord(k), g });
  }
  return out;
};
/* our fighter flights that can fly a strike there and back now */
function flights(S, at) {
  const K = IC.AIR_KIND.ftr, reach = K.endur * K.spd * IC.STRIKE.reach;
  return S.roster.filter(r => r.kind === 'ftr' && r.st === 'ready' && (r.n || 0) > 0 && !IC.missionOk(S, Object.assign({}, r, { load: 'strike' }), 'strike')).map(r => ({ r, b: IC.baseOf(S, r.base) }))
    .filter(f => f.b && U.dist(f.b, at) <= reach).sort((p, q) => U.dist(p.b, at) - U.dist(q.b, at));
}
/* where a strike aims: the launchers we know of first, else the middle of the batteries */
function aimPoint(S, bats) {
  const L = []; for (const B of bats) for (const l of alive(B)) if (known(S, B, l)) L.push(l.tel ? { x: l.kx || l.x, y: l.ky || l.y } : { x: B.x, y: B.y });
  const P = L.length ? L : bats.map(B => ({ x: B.x, y: B.y }));
  return { x: P.reduce((s, p) => s + p.x, 0) / P.length, y: P.reduce((s, p) => s + p.y, 0) / P.length };
}
/* their defence over a point: air defence launchers whose reach covers it, fighters at bases within 250 km */
function defenceAt(S, p) {
  let sam = 0, ftr = 0;
  for (const B of Object.values(S.wp.bats)) if (B.w === 'sam') { const R = B.R || IC.WP_W.sam.R; if (U.dist(B, p) < R) sam += alive(B).length; }
  for (const s of S.esites) if (s.kind === 'airbase' && !s.destroyed && !s.dormant && U.dist(s, p) < 2500) ftr += (s.acAvail && s.acAvail.ftr) || 0;
  return { sam, ftr: Math.min(ftr, 8) };
}
/* the odds of one package: the chance each jet is lost, the launchers we expect to destroy, and the sums behind them */
IC.strikeOdds = function (S, sec, grp, pk) {
  const P = IC.STRIKE, F = IC.strikeFocus(S, sec, grp);
  if (!F) return null;
  const bats = F.bats, at = aimPoint(S, bats);
  const D = defenceAt(S, at), pkg = IC.STRIKE_PKG[pk];
  const samP = P.sam * D.sam * (pkg.sead ? P.sead : 1), ftrP = P.ftr * D.ftr * (pkg.escort ? P.escort : 1);
  const loss = U.clamp(P.base + samP + ftrP, 0.02, P.cap);
  let n = 0, k = 0; for (const B of bats) for (const l of alive(B)) { n++; if (known(S, B, l)) k++; }
  const jets = pkg.jets, there = jets * (1 - loss);
  // the jets go for the launchers we know of first; the rest hunt
  const onKnown = Math.min(there, k), hunting = Math.max(0, Math.min(there - onKnown, n - k));
  const kills = Math.min(n, onKnown * P.kill + hunting * P.blind);
  const all = jets + pkg.escort + (pkg.sead ? 2 : 0);
  return { sec, grp, pk, at, bats, rest: F.rest, n, k, D, loss, lossJets: loss * all, kills, jets, all, samP, ftrP, pkg, words: oddsWords(D, loss, k, n) };
};
function oddsWords(D, loss, k, n) {
  const ad = D.sam ? `${D.sam} of their air defence launchers cover it` : 'no air defence we know of covers it';
  const ftr = D.ftr ? `, ${D.ftr} of their fighters are within reach` : '';
  const kn = k >= n ? 'we know where every launcher is' : k ? `we know where ${k} of the ${n} launchers are; the rest we would have to hunt for` : `we have not located any of its ${n} launchers: the jets would be hunting`;
  return `${U.cap ? U.cap(ad) : ad.charAt(0).toUpperCase() + ad.slice(1)}${ftr}; ${kn}. Each jet has about a ${Math.round(loss * 100)}% chance of being shot down.`;
}

/* ---------- the conversation ---------- */
/* what Voss says about a sector and a kind of target, and which packages she will fly */
IC.strikeTalk = function (S, sec, grp) {
  const X = S0(S), E = S.enemy, trust = IC.trustOf(S, 'CDS'), P = IC.STRIKE;
  const why = IC.strikeBlock(S);
  if (why) return { block: why, line: why };
  const bats = IC.strikeTargets(S, sec, grp);
  if (!bats.length) return { block: 'nothing', line: `We have nothing on ${IC.WP_GRP[grp].name.toLowerCase()} in the ${IC.wpSectorWord(sec)}. Either they are not there, or they are already gone.` };
  const odds = IC.STRIKE_PKG.map((_, i) => IC.strikeOdds(S, sec, grp, i));
  const at = odds[0].at, F = flights(S, at), jets = F.reduce((s, f) => s + f.r.n, 0);
  if (!jets) return { block: 'reach', line: `Nothing we have can reach the ${IC.wpSectorWord(sec)} and come back from where our fighters are, or every flight is in the air or rearming.` };
  // how many crews she will risk for the launchers we would get: more with trust, more for launchers that are about to fire
  const limit = 0.6 + trust / 40;
  const pk = odds.map(o => {
    const enough = jets >= o.all;
    const ok = enough && (o.lossJets <= limit || o.kills >= o.lossJets * 2.5);
    return { o, enough, ok, why: !enough ? `we have ${jets} jets ready that can reach it` : ok ? '' : `about ${o.lossJets.toFixed(1)} aircraft lost for ${o.kills.toFixed(1)} launchers` };
  });
  // she recommends the package with the best launchers for the crews it costs, among those she would fly
  const fly = pk.filter(p => p.ok);
  const rec = fly.length ? fly.slice().sort((a, b) => (b.o.kills / (0.3 + b.o.lossJets)) - (a.o.kills / (0.3 + a.o.lossJets)))[0] : null;
  const o = odds[0], what = IC.WP_GRP[grp].name.toLowerCase();
  const names = o.bats.map(B => B.name).join(' and ');
  let line = `${cap(what)} in the ${IC.wpSectorWord(sec)}: we would go for ${names}. ${o.words}`;
  if (o.rest.length) line += ` ${o.rest.map(B => B.name).join(' and ')} ${o.rest.length > 1 ? 'are' : 'is'} too far from there for the same strike.`;
  if (rec) line += ` My advice: ${rec.o.pkg.words}. I expect to destroy about ${Math.round(rec.o.kills)} and to lose ${rec.o.lossJets < 0.5 ? 'nobody, with luck' : `about ${Math.round(rec.o.lossJets)} aircraft`}.`;
  else line += ` I will not send crews into that for what we would get. ${trust >= 25 ? 'If you order it, I will fly it, and it will be on you.' : 'Find another Chief of Defence if you want it done.'}`;
  // (brief 79) where the jets come back to, and what waits for them there
  const home = F[0].b, G = IC.baseGuard(S, home), away = IC.strikeHomes(S, home, at);
  const turn = IC.AIR_KIND.ftr.turn * 2 * (home.parts ? IC.baseStatus(S, home).turn : 1);
  let base = ` The jets come back to ${home.name} and spend about ${U.dur(turn)} on the ground rearming. ${G.words}`;
  if (E && E.war) base += ` They will have watched them take off: expect their answer on ${home.name}.`;
  if (G.risk === 'high') base += ` ${away.length ? `If you want them out of it, they can land at ${away[0].name} instead.` : 'Fix that before you send them.'}`;
  return { sec, grp, line, base, pk, rec: rec ? odds.indexOf(rec.o) : -1, jets, trust, canInsist: trust >= 25, home, guard: G, away };
};
/* why no strike can be flown now, or '' */
IC.strikeBlock = function (S) {
  const X = S0(S), E = S.enemy;
  if (!S.wp) return 'There is no war plan for this game: nothing to strike.';
  if (IC.sagaOn && IC.sagaOn(S) && IC.sagaLock(S, 'strike')) return IC.sagaLock(S, 'strike');
  if (!E || !E.war) return 'We are not at war. A strike across the border now would start one.';
  if (X.cur.length) return 'Our last strike is still in the air.';
  const per = IC.trustOf(S, 'CDS') >= IC.STRIKE.high ? IC.STRIKE.perHigh : IC.STRIKE.per;
  if (X.wave === waveMark(S) && X.used >= per) return `The crews have flown ${X.used > 1 ? 'twice' : 'once'} since their last raid. Give them until after the next one.`;
  return '';
};
const waveMark = S => S.wp ? S.wp.i * 1000 + S.wp.loopN + (S.enemy.raidN || 0) * 1e6 : 0;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- ordering it ---------- */
IC.strikeOrder = function (S, sec, grp, pk, insist, to) {
  const X = S0(S), talk = IC.strikeTalk(S, sec, grp);
  if (talk.block) return { ok: false, why: talk.line };
  const p = talk.pk[pk];
  if (!p.enough) return { ok: false, why: `Not enough jets: ${p.why}.` };
  if (!p.ok) {
    if (!insist) return { ok: false, why: 'She will not fly it unless you insist.', insist: true };
    if (!talk.canInsist) return { ok: false, why: 'She refuses outright.' };
    IC.castTrust(S, 'CDS', -6, 'ordered a strike she advised against');
    X.insist++;
  }
  const o = p.o, F = flights(S, o.at);
  const need = o.all, use = [];
  let got = 0;
  for (const f of F) { if (got >= need) break; use.push(f); got += f.r.n; }
  // (brief 79) they watch where a strike takes off from; the jets may land somewhere else afterwards
  const from = {}; for (const f of use) from[f.b.id] = (from[f.b.id] || 0) + f.r.n;
  const fromId = Object.keys(from).sort((a, b) => from[b] - from[a])[0];
  const dest = to && talk.away.find(b => b.id === to) ? to : null;
  const st = { id: ++X.n, sec, grp, pk, t: S.time, at: o.at, odds: { loss: o.loss, kills: o.kills }, bats: o.bats.map(B => B.id), out: [], back: 0, lost: 0, killed: [], arrived: 0, insisted: !p.ok, from: fromId, to: dest };
  X.from = fromId;
  // which flights bomb, which escort and which hunt radars: bombers first, in the order the jets were found
  let bomb = o.jets, esc = o.pkg.escort, sead = o.pkg.sead ? 2 : 0;
  for (const f of use) {
    const role = bomb > 0 ? 'bomb' : esc > 0 ? 'escort' : sead > 0 ? 'sead' : 'bomb';
    if (role === 'bomb') bomb -= f.r.n; else if (role === 'escort') esc -= f.r.n; else sead -= f.r.n;
    f.r.load = role === 'bomb' ? 'strike' : 'aa';
    const a = IC.launchAir(S, f.r, { type: 'xstrike', x: o.at.x, y: o.at.y, sid: st.id, role, to: dest, site: { name: `${IC.WP_GRP[grp].name.toLowerCase()} in the ${IC.wpSectorWord(sec)}` } });
    if (a) st.out.push({ id: a.id, name: f.r.name, n: f.r.n, role });
  }
  if (!st.out.length) return { ok: false, why: 'None of the flights could get off the ground.' };
  X.cur.push(st);
  const mk = waveMark(S); if (X.wave !== mk) { X.wave = mk; X.used = 0; } X.used++;
  X.log.unshift(st); if (X.log.length > 20) X.log.length = 20;
  IC.say && IC.say(S, 'CDS', `${st.out.map(f => f.name).join(', ')} going. ${o.pkg.words.charAt(0).toUpperCase() + o.pkg.words.slice(1)}, for the ${IC.WP_GRP[grp].name.toLowerCase()} in the ${IC.wpSectorWord(sec)}. You will see them cross the border.${dest ? ` They land at ${S.byId[dest].name} afterwards.` : ''}`);
  IC.emit(S, 'strikeOrdered', st);
  return { ok: true, st };
};

/* ---------- over the target: the dice ---------- */
IC.strikeArrive = function (S, a, m) {
  const X = S0(S), st = X.cur.find(s => s.id === m.sid);
  if (!st || m.done) return;
  m.done = true;
  if (m.to && a.r && S.byId[m.to]) a.r.base = m.to;
  const o = IC.strikeOdds(S, st.sec, st.grp, st.pk) || { loss: st.odds.loss };
  const where = `over the ${IC.wpSectorWord(st.sec)}`;
  // every jet of the flight runs the gauntlet
  for (let i = (a.hp || a.n) - 1; i >= 0 && !a.dead; i--) if (Math.random() < o.loss) { st.lost++; IC.airLostOne(S, a, `their air defence ${where}`); }
  if (!a.dead && m.role === 'bomb') {
    // each surviving jet goes for a launcher: the known ones first
    const L = [];
    for (const id of st.bats) { const B = S.wp.bats[id]; if (B) for (const l of alive(B)) L.push({ B, l, k: known(S, B, l) }); }
    L.sort((p, q) => (q.k ? 1 : 0) - (p.k ? 1 : 0));
    for (let j = 0; j < (a.hp || 1) && L.length; j++) {
      const t = L.shift(), p = t.k ? IC.STRIKE.kill : IC.STRIKE.blind;
      const x = t.l.tel ? t.l.x : t.B.x + U.rand(-10, 10), y = t.l.tel ? t.l.y : t.B.y + U.rand(-10, 10);
      IC.explode(S, x, y, 0.9, 'ground');
      if (Math.random() < p && IC.wpKill(S, t.B, t.l, `${a.name}'s bombs`)) st.killed.push({ bat: t.B.id, name: t.l.name });
    }
    a.gbu = 0;
    IC.weaponRelease && IC.weaponRelease(S, a);
  }
  st.arrived++;
  S.enemy.retaliate = Math.max(S.enemy.retaliate || 0, 0.7);
  if (st.arrived >= st.out.length) finish(S, X, st);
};
/* every flight of a strike has been over the target (or is gone): the report */
function finish(S, X, st) {
  X.cur = X.cur.filter(s => s !== st);
  st.done = S.time;
  const by = {}; for (const k of st.killed) { const B = S.wp.bats[k.bat]; by[B.name] = (by[B.name] || 0) + 1; }
  const list = Object.entries(by).map(([n, k]) => `${k} of ${n}`).join(', ');
  const jets = st.out.reduce((s, f) => s + f.n, 0);
  const text = `${jets} jets went into the ${IC.wpSectorWord(st.sec)}; ${st.lost ? `${st.lost} did not come back` : 'all of them are on their way home'}. ${st.killed.length ? `Destroyed: ${list} launcher${st.killed.length > 1 ? 's' : ''}. They will not fire in the next raid.` : 'Nothing destroyed: the launchers were not where we looked, or the bombs missed.'}`;
  st.text = text;
  const good = st.killed.length >= Math.max(1, st.lost);
  IC.castTrust(S, 'CDS', good ? 3 : st.lost ? -2 * st.lost : -1, good ? 'a strike that worked' : 'a strike that cost us');
  if (st.killed.length) S.enemy.will = Math.max(0, S.enemy.will - st.killed.length * 0.8);
  IC.log(S, st.killed.length ? 'kill' : 'warn', 'STRIKE', text, st.at);
  if (S.camp && IC.card) IC.card(S, st.killed.length ? 'Strike report: launchers destroyed' : 'Strike report: nothing destroyed', `The ${IC.wpSectorWord(st.sec)} · ${U.clock(S.time, S)}`, text, 'report');
  IC.say && IC.say(S, 'CDS', st.killed.length ? `${st.killed.length} launcher${st.killed.length > 1 ? 's' : ''} gone${st.lost ? `, for ${st.lost} of ours` : ''}. That is ${st.killed.length > 1 ? 'fewer' : 'one fewer'} coming at us tonight.` : `We came back with nothing${st.lost ? ` and ${st.lost} fewer jets` : ''}. They had moved, or they were never there.`);
  IC.emit(S, 'strikeDone', st);
}
/* a flight shot down on the way, or sent home, before it reached the target */
IC.strikeGone = function (S, a, m) {
  const X = S0(S), st = X.cur.find(s => s.id === m.sid);
  if (!st || m.done) return;
  m.done = true; st.arrived++;
  if (st.arrived >= st.out.length) finish(S, X, st);
};
IC.on((S, type, a) => { if (type === 'acLost' && a && a.dead && a.mission && a.mission.type === 'xstrike') IC.strikeGone(S, a, a.mission); });
/* ---------- the base the jets come home to (brief 79) ----------
   A strike tells them where our jets are: they watch them take off, and their answer comes on that base while the
   jets are on the ground rearming. Keeping them alive there is the player's job: hardened shelters (nine in ten come
   through a hit close by), a battery over the base, a fuel farm away from the shelters, or landing them elsewhere. */
IC.baseGuard = function (S, b) {
  let jets = 0, shel = 0, half = 0, open = 0;
  for (const r of S.roster) {
    if (r.base !== b.id || r.st === 'lost') continue;
    const n = r.n || 1, q = IC.parkPos(S, b, r); jets += n;
    if (q.fac && q.fac.kind === 'has') shel += n; else if (q.fac) half += n; else open += n;
  }
  const cover = S.units.filter(u => u.d.cat === 'ad' && u.state === 'ready' && IC.maxRange(S, u) > 0 && U.dist(u, b) <= IC.maxRange(S, u) * 0.9);
  const fuel = (b.parts || []).filter(p => p.kind === 'fuel' && p.built && p.hp > 0).map(f => IC.fuelNear(b, f)).filter(Boolean);
  const risk = open && !cover.length ? 'high' : open || !cover.length ? 'some' : 'low';
  const parts = [shel && `${shel} in hardened shelters`, half && `${half} in hangars or alert sheds`, open && `${open} on open stands`].filter(Boolean);
  let words = jets ? `${b.name} has ${jets} aircraft: ${parts.join(', ')}.` : `${b.name} has no aircraft of ours on it.`;
  words += cover.length ? ` ${cover.length > 1 ? `${cover.length} of our batteries cover it` : `${cover[0].name} covers it`}.` : ' None of our air defence covers it.';
  if (open) words += ' A missile that lands near a jet in the open destroys it four times in five; in a hardened shelter, once in ten.';
  if (fuel.length) words += ` ${IC.fuelNearText(fuel[0])}`;
  return { jets, shel, half, open, cover, fuel, risk, words };
};
/* where the jets could land after a strike instead of coming home: our other bases they can use and reach on the fuel
   a round trip home would take, nearest home first (an airliners' airport too: it is war, and they are ours) */
IC.strikeHomes = function (S, home, at) {
  const T = IC.ACTYPES[IC.AIRKIND_TYPE.ftr], K = IC.AIR_KIND.ftr, reach = K.endur * K.spd * IC.STRIKE.reach;
  return IC.bases(S).filter(b => b !== home && b.owner === 'us' && b.parts && b.active !== false && !b.offline && (b.kind === 'airbase' || b.kind === 'airport')
    && (b.st && b.st.longest || 0) >= T.rwy && IC.baseStatus(S, b).runway && (!at || U.dist(home, at) + U.dist(at, b) <= 2 * reach))
    .sort((a, b) => U.dist(a, home) - U.dist(b, home)).slice(0, 3);
};
/* jets lost on the ground in a raid: she says so after it, with what would have saved them */
IC.on((S, type, d) => {
  if (type !== 'baseHit' || !d.milLost || !S.wp || !S.enemy || !S.enemy.war) return;
  const hurt = S0(S).hurt || (S0(S).hurt = {});
  hurt[d.base.id] = (hurt[d.base.id] || 0) + d.milLost;
});
IC.on((S, type) => {
  if (type !== 'raidOver' || !S.strike || !S.strike.hurt) return;
  const hurt = S.strike.hurt; S.strike.hurt = null;
  for (const id of Object.keys(hurt)) {
    const b = S.byId[id]; if (!b) continue;
    const G = IC.baseGuard(S, b), fix = [];
    if (G.open) fix.push(`hardened shelters for the ${G.open} still in the open`);
    if (!G.cover.length) fix.push('a battery over the base');
    if (G.fuel.length) fix.push('the fuel farm further from the shelters');
    const n = hurt[id], text = `${n} of our aircraft ${n > 1 ? 'were' : 'was'} destroyed on the ground at ${b.name}.${fix.length ? ` What would have saved them: ${fix.join(', ')}, or the jets landing somewhere else after a strike.` : ''}`;
    IC.log(S, 'leak', 'AIR', text, b);
    IC.say && IC.say(S, 'CDS', `They caught them on the ground at ${b.name}: ${hurt[id]} aircraft gone without leaving the runway.${fix.length ? ` ${fix[0].charAt(0).toUpperCase() + fix[0].slice(1)}.` : ''}`);
    if (S.camp && IC.card) IC.card(S, 'Aircraft lost on the ground', `${b.name} · ${U.clock(S.time, S)}`, text, 'report');
    IC.emit(S, 'groundLoss', { base: b, n: hurt[id], guard: G });
  }
});
/* after their first raid, she says what can be done about the launchers */
IC.on((S, type, R) => {
  if (type !== 'raidOver' || !S.wp || !S.enemy || !S.enemy.war || S.mode === 'test') return;
  const X = S0(S);
  if (X.told) return;
  X.told = true;
  IC.say && IC.say(S, 'CDS', `We can do more than catch what they throw. Every launch tells us roughly where it came from; give me a sector and I will tell you what we can hit there and what it would cost. The Air room, Counter-strike.`);
});

})(window.IC);
