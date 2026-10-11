/* Iron Canopy — (brief 48) research from day one: the civil tree and the modifier system.
   - Modifiers: a project (or, from brief 49, a Ministry policy) carries fx: { refuel: 0.05 }, a share. IC.mod(S, key)
     is 1 + the sum of every source's share for key, capped by IC.MOD_CAP (default ±30%); IC.modAdd(S, key) is the sum
     alone (for keys in kt, like xwind). Sources are functions on IC.MOD_SRC, (S) => [{ fx, why, src }] (src: 'research', 'the Ministry'), so a panel can say
     where each share came from (IC.modWhy, IC.modNote). The value is cached until a source changes: whoever changes
     one calls IC.modDirty(S). Each system multiplies its own constant once, in the step and in IC.aptStats alike.
   - IC.MOD_WORDS[key] says in a sentence what a key does, with {p} for the share ("Fuel trucks refuel {p} more
     aircraft an hour").
   Headless. */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- modifiers ---------- */
IC.MOD_SRC = [];
IC.MOD_CAP = { xwind: 6, grant: 0.5 };
/* keys where less is better: the words say "less", the panels show a fall as a gain */
IC.MOD_LESS = { rwOcc: 1, turn: 1, buildCost: 1, matLoads: 1, fireTime: 1, birds: 1, fuelSpread: 1, pushback: 1, catering: 1, board: 1 };
IC.MOD_WORDS = {
  refuel: { t: 'Fuel trucks refuel {p} more aircraft an hour.', short: 'refuelling' },
  board: { t: 'Boarding and deplaning take {p} less time.', short: 'boarding' },
  catering: { t: 'Catering and cleaning take {p} less time.', short: 'catering' },
  pushback: { t: 'Pushbacks and tows take {p} less time.', short: 'pushback' },
  turn: { t: 'Every turnaround takes {p} less time.', short: 'turnaround' },
  rwOcc: { t: 'Aircraft hold the runway {p} less long, so it takes more movements an hour.', short: 'runway occupancy' },
  ctlLoad: { t: 'Each controller handles {p} more flights at once.', short: 'controller load' },
  buildSpeed: { t: 'Construction stages run {p} quicker.', short: 'building speed' },
  buildCost: { t: 'Airport works cost {p} less.', short: 'building cost' },
  matLoads: { t: 'Paving needs {p} fewer lorry loads a hectare.', short: 'lorry loads' },
  paveLife: { t: 'Pavement lasts {p} longer before it wears out.', short: 'pavement life' },
  bldLife: { t: 'Buildings last {p} longer before they need rebuilding.', short: 'building life' },
  xwind: { t: 'Crews land and take off in {k} kt more crosswind.', short: 'crosswind limit', kt: true },
  fireTime: { t: 'Fire trucks reach the runway {p} sooner.', short: 'fire response' },
  birds: { t: '{p} fewer bird strikes.', short: 'bird strikes' },
  offerRate: { t: 'Airline offers come {p} sooner.', short: 'offers' },
  overList: { t: 'Airlines accept charges {p} further over list.', short: 'over list', abs: true },
  forgive: { t: 'Bad days are forgiven {p} sooner.', short: 'forgiving' },
  cargoRate: { t: 'Cargo warehouses handle {p} more freight.', short: 'cargo handling' },
  repair: { t: 'Runways and roads are repaired {p} faster.', short: 'repairs' },
  fuelSpread: { t: 'Burning fuel is {p} less likely to spread to nearby tanks.', short: 'fire spread' },
  grant: { t: 'The Ministry’s grant is {p} larger.', short: 'grant' }
};
const capOf = k => IC.MOD_CAP[k] != null ? IC.MOD_CAP[k] : 0.3;
IC.modDirty = S => { if (S) S._modV = (S._modV || 0) + 1; };
function build(S) {
  const sum = {}, why = {};
  for (const src of IC.MOD_SRC) for (const s of src(S) || []) for (const k in s.fx) {
    sum[k] = (sum[k] || 0) + s.fx[k];
    (why[k] = why[k] || []).push({ why: s.why, v: s.fx[k], src: s.src });
  }
  for (const k in sum) { const c = capOf(k); sum[k] = U.clamp(sum[k], -c, c); }
  return { v: S._modV || 0, sum, why };
}
const cache = S => (S._mod && S._mod.v === (S._modV || 0)) ? S._mod : (S._mod = build(S));
/* the sum of every share for key, capped */
IC.modAdd = (S, key) => !S ? 0 : (cache(S).sum[key] || 0);
/* 1 + that: multiply the constant by it (or divide, for a rate) */
IC.mod = (S, key) => 1 + IC.modAdd(S, key);
/* where each share came from: [{ why, v }] */
IC.modWhy = (S, key) => (S && cache(S).why[key]) || [];
/* "(+10% from research)": what a panel puts beside the number it changed; '' when nothing changes it */
IC.modNote = function (S, key) {
  const L = IC.modWhy(S, key); if (!L.length) return '';
  const W = IC.MOD_WORDS[key] || {}, v = IC.modAdd(S, key);
  const amt = W.kt ? `${v > 0 ? '+' : ''}${Math.round(v)} kt` : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  const from = [...new Set(L.map(x => x.src || 'research'))];
  return `(${amt} from ${from.join(' and ')})`;
};
/* a key's sentence for a share */
IC.modWords = function (key, v) {
  const W = IC.MOD_WORDS[key]; if (!W) return key;
  return W.t.replace('{p}', `${Math.round(Math.abs(v) * 100)}%`).replace('{k}', String(Math.round(Math.abs(v))));
};
/* finished research is the first source */
IC.MOD_SRC.push(S => {
  const out = [];
  if (!S.tech) return out;
  for (const id of S.tech.done) { const t = IC.techById(id); if (t && t.fx) out.push({ fx: t.fx, why: t.name, src: 'research' }); }
  return out;
});
IC.techById = id => IC.TECH.find(t => t.id === id);

})(window.IC);
