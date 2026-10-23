/* Iron Canopy — airports of different sizes and purposes. The player picks what an airport is for when founding it:
   an airfield for light aircraft, a regional airport, a national airport, an international hub or a cargo airport.
   The class sets the surveyed runway's length, the site's size, what the land and founding cost, the airspace it
   starts with, the Starter airport laid on it, and which airlines want to fly there. It can be changed later (the
   site grows, the land is paid for); nothing is refused because of it, but the airport says what its purpose still
   lacks. Headless. */
(function (IC) {
'use strict';
const U = IC.U;
const up = s => s.charAt(0).toUpperCase() + s.slice(1);

/* rw: the surveyed runway in units (100 m); site: the site's reach from the reference point; cost: the founding
   price and land against a national airport's; noise: how far its flight paths are heard, against airliners'; asp: the airspace shape it starts with; want: how much each kind of
   airline wants to fly from it (1 = as now); starter: the Starter airport on it (stand count and size, a cargo area,
   the stands' zone) */
IC.APT_CLASS = {
  field: { name: 'Airfield', short: 'Airfield', sfx: 'Airfield', rw: 12, site: 30, cost: 0.3, land: 0.3, noise: 0.35, asp: 'D',
    use: 'Light aircraft, flying clubs and air taxis on a 1.2 km runway. Cheap, and quiet for the towns round it.',
    want: { flag: 0, budget: 0, regional: 0.3, cargo: 0.2, foreign: 0 }, starter: { n: 6, size: 's', zone: 'light', mat: 'asph', ils: false, tower: false } },
  regional: { name: 'Regional airport', short: 'Regional', sfx: 'Regional', rw: 22, site: 45, cost: 0.6, land: 0.6, noise: 0.7, asp: 'D',
    use: 'Turboprops and regional jets on short hops, and narrow-body jets on a 2.2 km runway.',
    want: { flag: 0.5, budget: 1.5, regional: 3, cargo: 0.5, foreign: 0.2 }, starter: { n: 5, size: 'm' } },
  national: { name: 'National airport', short: 'National', sfx: 'Airport', rw: 30, site: 65, cost: 1, land: 1, noise: 1, asp: 'D',
    use: 'Every airliner on a 3 km runway: the flag carrier, low-cost and foreign airlines.',
    want: { flag: 1, budget: 1, regional: 1, cargo: 1, foreign: 1 }, starter: { n: 8, size: 'm' } },
  hub: { name: 'International hub', short: 'Hub', sfx: 'International', rw: 40, site: 100, cost: 1.8, land: 2.2, noise: 1.2, asp: 'C',
    use: 'Long-haul wide-bodies and foreign carriers on a 4 km runway, with room for more runways and terminals.',
    want: { flag: 2, budget: 0.8, regional: 0.6, cargo: 1, foreign: 3 }, starter: { n: 10, size: 'l' } },
  mega: { name: 'Mega hub', short: 'Mega', sfx: 'International', rw: 40, site: 160, cost: 3, land: 4, noise: 1.6, asp: 'C',
    use: 'A country\'s main gateway: two 4 km runways 2.2 km apart that work at once, concourses between them with 88 gates, and room for more.',
    want: { flag: 2.5, budget: 1.2, regional: 0.5, cargo: 1.5, foreign: 4 }, starter: { n: 80, size: 'l', mega: true } },
  cargo: { name: 'Cargo airport', short: 'Cargo', sfx: 'Cargo', rw: 32, site: 70, cost: 1.1, land: 1.1, noise: 1.1, asp: 'D',
    use: 'Freighters day and night on a 3.2 km runway, with a cargo terminal and large stands.',
    want: { flag: 0.3, budget: 0.3, regional: 0.3, cargo: 4, foreign: 0.3 }, starter: { n: 3, size: 'm', cargo: true } }
};
IC.APT_CLASSES = ['field', 'regional', 'national', 'hub', 'mega', 'cargo'];
/* 'an airfield', 'a regional airport' */
IC.aWord = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
/* an airport's class: picked when founded, or read from the layout it started with */
const OF_TEMPLATE = { intl: 'national', regional_ok: 'regional', regional_bad: 'regional', kden: 'hub', kden6: 'hub' };
IC.aptClass = ap => !ap || ap.kind !== 'airport' ? null : ap.cls || (ap.showcase || ap.real ? 'hub' : OF_TEMPLATE[ap.template]) || 'national';
IC.aptClassOf = ap => IC.APT_CLASS[IC.aptClass(ap)] || null;
/* the class a new airport is founded as when the player has not picked one: the Career's national airport first,
   then regional airports; elsewhere a national airport, as before classes */
IC.foundDefault = S => S.story ? (S.story.cap ? 'regional' : 'national') : 'national';
IC.foundLen = cls => (IC.APT_CLASS[cls] || IC.APT_CLASS.national).rw;

/* how much an airline of a kind wants this airport, for the offers it makes (aviation.js) */
IC.aptWant = function (ap, kind) {
  const K = IC.aptClassOf(ap); if (!K) return 1;
  const w = K.want[kind]; return w == null ? 1 : w;
};

/* change what an airport is for: a bigger class buys the land for its bigger site; a smaller one keeps the site */
IC.aptReclassCost = function (S, ap, cls) {
  const a = IC.aptClassOf(ap), b = IC.APT_CLASS[cls]; if (!a || !b) return 0;
  return Math.max(0, Math.round((b.land - a.land) * 40 + (b.cost - a.cost) * IC.FOUND_COST * 0.5));
};
IC.aptReclass = function (S, ap, cls) {
  const K = IC.APT_CLASS[cls]; if (!K || !ap || ap.kind !== 'airport' || ap.owner !== 'us') return 'Not an airport of ours.';
  if (IC.aptClass(ap) === cls) return '';
  const cost = IC.aptReclassCost(S, ap, cls);
  if (S.budget < cost) return `Needs ${U.money(cost)} for the land.`;
  if (cost) IC.pay(S, 'other', cost);
  const was = IC.aptClassOf(ap).name;
  ap.cls = cls; ap.buildR = Math.max(ap.buildR || 0, K.site);
  // (the airspace that came with the old class follows the new one, unless the player has shaped it)
  if (S.asp) S.asp.zs = null;
  IC.log(S, 'info', 'AVIATION', `${ap.name} is now ${IC.aWord(K.name.toLowerCase())} (was ${IC.aWord(was.toLowerCase())})${cost ? `: ${U.money(cost)} for the land` : ''}. ${K.use}`, ap);
  IC.emit(S, 'reclass', { ap, cls });
  return '';
};

/* what the airport still lacks for its purpose, in plain words: one line each (shown with its warnings) */
IC.aptPurposeLacks = function (S, ap) {
  const K = IC.aptClassOf(ap), cls = IC.aptClass(ap), out = [];
  if (!K || !ap.parts || !ap.parts.some(p => p.kind === 'runway' && p.built)) return out;
  const st = ap.st || {}, built = k => ap.parts.some(p => p.kind === k && p.built);
  const longest = Math.max(0, ...ap.parts.filter(p => p.kind === 'runway' && p.built).map(p => IC.rwLen(p)));
  const need = { regional: 21, national: 27, hub: 30, mega: 30, cargo: 29 }[cls];
  if (need && longest < need - 0.05) out.push(`${up(IC.aWord(K.name.toLowerCase()))} needs a runway of ${U.km(need)} for its airliners: the longest here is ${U.km(longest)}.`);
  if (cls === 'cargo' && !built('cargo')) out.push('A cargo airport without a cargo terminal: freighters will not come. Build the Cargo area beside the taxiway.');
  if ((cls === 'regional' || cls === 'national' || cls === 'hub' || cls === 'mega') && !built('terminal')) out.push(`${up(IC.aWord(K.name.toLowerCase()))} without a terminal: no airline will come. Build a terminal with its apron.`);
  if (cls === 'hub' || cls === 'mega') {
    const P = IC.aptProvides ? IC.aptProvides(ap) : null;
    if (P && !(P.stands.l > 0)) out.push(`${up(IC.aWord(K.name.toLowerCase()))} without large stands: wide-bodies cannot park. Build a terminal with large stands.`);
  }
  if (cls === 'mega' && ap.parts.filter(p => p.kind === 'runway' && p.built && IC.rwLen(p) >= 27).length < 2) out.push('A mega hub with one long runway: its airlines expect two that work at once. Build a second runway at least 1.1 km beside the first.');
  if (cls === 'field' && longest > 20) out.push(`An airfield with a ${U.km(longest)} runway: airliners could land here, but airlines will not come to an airfield. Change its purpose to fly them.`);
  return out;
};

})(window.IC);
