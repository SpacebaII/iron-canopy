/* Iron Canopy — what makes an intercept hard, and why each one missed (brief 79).
   An interceptor's kill chance is its round's own (against that kind of target, from that crew) times a factor for
   each thing working against it, each with a name (IC.icptFactors):
     range      a shot near the end of its reach arrives slow and turns badly
     weather    rain and cloud blind a heat-seeker; heavy rain and snow clutter a radar
     clutter    a target under 150 m hides in the ground's own echo from a radar on the ground
     manoeuvre  a warhead or cruise missile that jinks at the end
     speed      too fast for a blast warhead's fuse to time its burst (the share a ballistic warhead's speed takes)
     energy     a missile slow at the end cannot follow the target's last turn (at the fuse)
   A miss is put down to one of them by its share (IC.icptRoll), the missile says so (m.end.cause, the word on the
   map) and render-intercept.js plays it as something seen: the burst behind, the jink, the dive into the clutter,
   the seeker lost in cloud, the spent round tumbling down. While it flies the map shows the same factors (the
   clutter round a low track, a guidance link breaking up in rain, a weaving warhead), and a track nobody can answer
   yet because every battery in reach is busy (IC.icptUnanswered). Headless: the renderer only reads it. */
(function (IC) {
'use strict';
const U = IC.U;

IC.ICPT = {
  lowAlt: 0.15,    // km: under this a radar on the ground sees the target against the ground's echo
  clutter: 0.82,   // what is left of a radar-guided round's chance against a target in the clutter
  rain: 0.15,      // the share a radar-guided round loses in the heaviest rain (by the weather's precip)
  fastV: 6,        // world units a second (600 m/s): faster than this a blast warhead's fuse struggles
  fastK: 0.08,     // the share lost for each 100 m/s above that
  fastMin: 0.6
};
IC.ICPT_WORDS = {
  range: 'ARRIVED TOO SLOW',
  weather: { ir: 'LOST IT IN CLOUD', radar: 'RAIN ON THE RADAR' },
  clutter: 'LOST IN GROUND CLUTTER',
  manoeuvre: 'MANOEUVRED',
  speed: { frag: 'TOO FAST: BURST BEHIND IT', htk: 'TOO FAST: PASSED BEHIND IT' },
  energy: 'COULD NOT FOLLOW THE TURN'
};
const BAL = { bal: 1, mid: 1, hgv: 1 };

/* low enough to hide in the ground's echo (anything that flies: a ballistic warhead comes down too fast for it) */
IC.icptLow = t => !t.dead && (t.alt || 0) < IC.ICPT.lowAlt && !BAL[t.d.cls] && t.d.cls !== 'rkt' && (t.spd || 0) > 0.2;
/* what a target's speed leaves of a blast warhead's chance (ballistic ones keep their round's own table) */
IC.icptFast = function (t) {
  const v = t.spd || U.hyp(t.vx || 0, t.vy || 0);
  return U.clamp(1 - IC.ICPT.fastK * (v - IC.ICPT.fastV), IC.ICPT.fastMin, 1);
};
/* the named factors against one shot, and the base they multiply: the round against that class (but for the share
   a ballistic warhead's speed takes), from that crew */
IC.icptFactors = function (S, u, t, M, vs, reach, crew) {
  const F = [], wx = IC.wx(S), bal = BAL[IC.classOf(t)];
  const add = (k, f) => { if (f < 0.999) F.push({ k, f }); };
  add('range', reach);
  add('weather', M.seeker === 'IR' ? wx.ir : 1 - IC.ICPT.rain * (wx.precip || 0));
  if (M.seeker !== 'IR' && !(u && (u.alt || 0) > 0.5) && IC.icptLow(t)) add('clutter', IC.ICPT.clutter);
  if (t.d.evasive) add('manoeuvre', t.d.evasive);
  add('speed', bal ? vs : M.seeker === 'HTK' ? 1 : IC.icptFast(t));
  let pk = M.pk * (bal ? 1 : vs) * crew;
  const base = pk;
  for (const x of F) pk *= x.f;
  return { F, base, pk };
};
/* the roll at the end: a hit, or a miss and what it is put down to. A miss within the round's own chance is just a
   miss; one the factors took is given to one of them by its share (−ln f) */
IC.icptRoll = function (m, more, add) {
  add = add || 0;
  const F = more && more.length ? (m.fac || []).concat(more) : m.fac || [];
  let pk = m.pk; if (more) for (const x of more) pk *= x.f;
  const r = Math.random();
  if (r < pk + add) return { hit: true, cause: null };
  if (r >= (m.pkB || m.pk) + add || !F.length) return { hit: false, cause: null };
  let s = 0; for (const x of F) s -= Math.log(x.f);
  let q = Math.random() * s;
  for (const x of F) { q += Math.log(x.f); if (q <= 0) return { hit: false, cause: x.k }; }
  return { hit: false, cause: F[F.length - 1].k };
};
/* the word on the map for a miss put down to a cause */
IC.icptWord = function (m, cause) {
  const w = IC.ICPT_WORDS[cause];
  if (!w || typeof w === 'string') return w || 'MISS';
  if (cause === 'weather') return m.M && m.M.seeker === 'IR' ? w.ir : w.radar;
  return m.M && m.M.seeker === 'HTK' ? w.htk : w.frag;
};
/* is a factor working on this missile now (the renderer draws it while it flies)? */
IC.icptHas = (m, k) => !!(m.fac && m.fac.some(x => x.k === k));

/* a hostile track inside a battery's reach that nothing is on its way to, because every battery that would take it
   is busy (just fired, reloading or empty): the battery it waits on, or null. Saturation, seen track by track */
IC.icptUnanswered = function (S, t) {
  if (t.dead || !t.det || t.aff !== 'H' || t.inbound > 0 || t.decoyKnown || t.spoofed || t.d.civil) return null;
  let wait = null;
  for (const u of S.units) {
    if (u.d.weapon !== 'sam' || u.state !== 'ready' || IC.effRoe(S, u) === 'hold') continue;
    if (U.dist(u, t) > IC.maxRange(S, u)) continue;
    const c = IC.classOf(t), mags = IC.activeMags(S, u).filter(q => (IC.MUN[q.mun].vs || {})[c] > 0);
    if (!mags.length) continue;
    const loaded = mags.some(q => q.mag > 0);
    // a battery free to fire and with a round loaded will take it: it is not waiting
    if (loaded && u.cool <= 0.6) return null;
    if (!wait) wait = u;
  }
  return wait;
};

})(window.IC);
