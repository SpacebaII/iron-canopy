/* Iron Canopy — building airports. Pavement materials, construction in visible stages paid for as they run,
   materials trucked in from industry, clearing homes to make room, the builder's tools and controls, and founding
   airports at other cities. The simulation rules (airport.js, groundops.js) stay as they are: this file decides
   what gets built, when, and at what cost. */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- pavement ---------- */
/* t = the heaviest aircraft (tonnes) it carries without wearing; cost and build scale the part's price and time;
   crater scales the hole a bomb leaves; patch scales the time to fill one; life is the calendar months weather and
   age take to wear it out (a runway resurfaced every few years stays open) */
IC.PAVE = {
  grass: { name: 'Grass', t: 6, cost: 0.15, build: 0.3, crater: 1.3, patch: 0.5, need: {}, life: 48, desc: 'light aircraft only' },
  asph: { name: 'Asphalt', t: 90, cost: 0.7, build: 0.7, crater: 1, patch: 1, need: { asph: 8 }, life: 96, desc: 'cheap and quick; heavy jets break it up' },
  conc: { name: 'Concrete', t: 400, cost: 1, build: 1, crater: 0.8, patch: 1.2, need: { conc: 10 }, life: 180, desc: 'carries every airliner' },
  rconc: { name: 'Reinforced concrete', t: 600, cost: 1.6, build: 1.4, crater: 0.55, patch: 0.6, need: { conc: 12, steel: 3 }, life: 240, desc: 'craters less, patched quickly' }
};
IC.PAVE_ORDER = ['grass', 'asph', 'conc', 'rconc'];
IC.PAVED = { runway: true, taxi: true, apron: true, alert: true };
/* maximum take-off weight in tonnes, for pavement strength */
IC.MTOW = { light: 1.1, turbo: 23, narrow: 79, wide: 350, cargo: 400, fighter: 22, heavy: 190, drone: 6, heli: 11 };
IC.paveOf = p => IC.PAVE[p.mat] ? p.mat : 'conc';
/* the largest aircraft a pavement carries, in words */
IC.paveFits = function (mat) {
  const P = IC.PAVE[mat], ok = Object.keys(IC.MTOW).filter(k => IC.MTOW[k] <= P.t && !IC.ACTYPES[k].vtol);
  const big = ok.sort((a, b) => IC.MTOW[b] - IC.MTOW[a])[0];
  const worn = ['heavy', 'wide', 'cargo', 'narrow'].filter(k => IC.MTOW[k] > P.t);
  return `${P.name.toLowerCase()}: fits up to a ${IC.ACTYPES[big].name.toLowerCase()} (${IC.ACTYPES[big].short})` + (worn.length ? `; a ${IC.ACTYPES[worn[worn.length - 1]].name.toLowerCase()} will wear it out` : '');
};
/* very heavy stands exist only on open ramps, where the player places them */
IC.STAND.xl = { w: 1.0, d: 1.0, name: 'very heavy' };
IC.STAND_FITS.xl = ['s', 'm', 'l', 'xl'];
IC.RAMP_SIZE = { s: 'light', m: 'medium', l: 'heavy', xl: 'very heavy' };

/* on a river (its drawn width), where nothing can be built */
IC.onRiver = function (x, y) {
  const W = IC.W; if (!W || !W.rivers) return false;
  for (const r of W.rivers) {
    if (x < r.bb[0] - r.w || x > r.bb[2] + r.w || y < r.bb[1] - r.w || y > r.bb[3] + r.w) continue;
    for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(x, y, a[0], a[1], b[0], b[1]) < r.w / 2) return true; }
  }
  return false;
};

/* ---------- materials ---------- */
IC.MATS = { asph: 'asphalt', conc: 'concrete', steel: 'steel' };
const YARD = 400;       // loads of each material the site can stockpile
const CONVOY = 600;     // lorries leave the supplier every ten minutes
const LORRY = 0.25;     // 90 km/h on the road
/* what a building takes to put up, in lorry loads */
const BLD_NEED = { terminal: { conc: 14, steel: 5, area: true }, cargo: { conc: 10, steel: 5, area: true }, hangar: { conc: 12, steel: 8 }, has: { conc: 25, steel: 6 }, alert: { conc: 10, steel: 3 },
  fuel: { conc: 3, steel: 6 }, hydrant: { conc: 4, steel: 10 }, tower: { conc: 6, steel: 3 }, fire: { conc: 4, steel: 2 }, atc: { conc: 2, steel: 3 }, gradar: { conc: 1, steel: 2 }, ils: { conc: 1, steel: 2 }, ammo: { conc: 8, steel: 3 },
  deice: { conc: 6, steel: 1 }, fuelpad: { conc: 3, steel: 2 } };
IC.partNeed = function (ap, p) {
  const out = {};
  if (IC.PAVED[p.kind]) {
    const P = IC.PAVE[IC.paveOf(p)], ha = p.kind === 'runway' || p.kind === 'taxi' ? IC.partMeasure(ap, p) * (p.w || IC.APART[p.kind].w) : (p.w || 0.4) * (p.h || 0.3);
    for (const k in P.need) out[k] = Math.ceil(P.need[k] * ha);
    return out;
  }
  const B = BLD_NEED[p.kind]; if (!B) return out;
  const m = B.area ? (p.w || 1) * (p.h || 1) : 1;
  for (const k of ['conc', 'steel']) if (B[k]) out[k] = Math.ceil(B[k] * m);
  return out;
};
/* where an airport's materials come from: the industrial town with the best delivery by road */
IC.bldSupply = function (S, ap) {
  const sp = ap.supply;
  if (sp && S.time - sp.t < 3600 && (!S.worldDirty || sp.dirty === S.worldDirty.length)) return sp;
  let best = null;
  for (const c of IC.cities(S)) {
    if (c.owner === 'enemy' || !c.ind) continue;
    const r = IC.route(c.x, c.y, ap.x, ap.y), len = IC.routeLength([{ x: c.x, y: c.y }].concat(r));
    const rate = (20 + c.ind * 1.5) * (c.hp && c.max ? U.clamp(c.hp / c.max, 0.2, 1) : 1), trip = IC.routeTime({ x: c.x, y: c.y }, r, LORRY, LORRY * 0.4);
    const score = rate / (1 + trip / 3600);
    if (!best || score > best.score) best = { city: c.id, name: c.name, km: len / 10, trip, rate: Math.round(rate), score, route: r, x: c.x, y: c.y };
  }
  ap.supply = best ? Object.assign(best, { t: S.time, dirty: S.worldDirty ? S.worldDirty.length : 0 }) : { t: S.time, rate: 0, trip: 0, km: 0, name: '', route: [] };
  return ap.supply;
};
/* the site's stockpile: an existing airport keeps some on hand, a new one starts with nothing */
const yardOf = ap => ap.mat || (ap.mat = ap.template === 'new' ? { asph: 0, conc: 0, steel: 0 } : { asph: 150, conc: 200, steel: 60 });
/* materials still needed by the works queued here */
function outstanding(ap) {
  const out = { asph: 0, conc: 0, steel: 0 };
  for (const w of ap.works) if (w.stages) for (let i = w.si; i < w.stages.length; i++) { const st = w.stages[i], f = i === w.si ? 1 - w.t / st.dur : 1; for (const k in st.mats || {}) out[k] += st.mats[k] * f; }
  return out;
}
/* lorries leave the supplier every ten minutes while there is work waiting, and unload when they arrive */
function deliveries(S, ap, dt) {
  const M = yardOf(ap);
  ap.convoys = ap.convoys || [];
  for (const c of ap.convoys) if (!c.done && S.time >= c.arr) { c.done = true; for (const k in c.loads) M[k] = Math.min(YARD, M[k] + c.loads[k]); }
  ap.convoys = ap.convoys.filter(c => !c.done);
  ap.convT = (ap.convT || 0) - dt;
  if (ap.convT > 0) return;
  ap.convT = CONVOY;
  const need = outstanding(ap), onWay = { asph: 0, conc: 0, steel: 0 };
  for (const c of ap.convoys) for (const k in c.loads) onWay[k] += c.loads[k];
  const want = {}; let tot = 0;
  for (const k in need) { const d = Math.max(0, Math.min(YARD, need[k]) - M[k] - onWay[k]); if (d > 0) { want[k] = d; tot += d; } }
  if (!tot) return;
  const sp = IC.bldSupply(S, ap); if (!sp.rate) return;
  const cap = sp.rate * CONVOY / 3600, loads = {};
  for (const k in want) loads[k] = Math.min(want[k], cap * want[k] / tot);
  ap.convoys.push({ t0: S.time, arr: S.time + sp.trip, loads, from: sp.name, n: Math.max(1, Math.round(Object.values(loads).reduce((a, b) => a + b, 0) / 4)) });
}

IC.bldTick = deliveries;

/* ---------- construction in stages ---------- */
/* the stages a crew works through, each one something to watch on site: surveyors pegging it out, graders and
   dump lorries on bare earth, the paver and rollers laying the surface, the paint lorry, the lights coming on one by
   one, and the inspection before it opens. t is its share of the part's build time (together a little over the
   base time, so there is time to watch), c its share of the cost */
const STAGE = [
  { k: 'survey', name: 'Survey', bname: 'Survey', t: 0.07, c: 0.03 },
  { k: 'earth', name: 'Earthworks', bname: 'Foundations', t: 0.28, c: 0.27 },
  { k: 'pave', name: 'Paving', bname: 'Structure', t: 0.44, c: 0.5, mats: true, rw: true },
  { k: 'mark', name: 'Markings', bname: 'Fitting out', t: 0.12, c: 0.08 },
  { k: 'lights', name: 'Lights', bname: 'Power and systems', t: 0.14, c: 0.12 },
  { k: 'open', name: 'Inspection', bname: 'Inspection', t: 0.1, c: 0 }
];
IC.STAGE = STAGE;
/* compensation for a city block (a street block of homes, shops or works) or a village house, in ₭M */
const COMP = b => b.core ? 40 : b.ind ? 20 : b.sub ? 6 : b.village ? 0.8 : 15;
/* a cleared city block weighs on the town like one block; a village house like a twentieth of one */
const WEIGHT = x => x.v ? 0.05 : x.b.sub ? 0.4 : 1;
/* what is to be cleared, in words: "2 city blocks (about 5,000 residents) and 3 village houses" */
IC.bldClearText = function (clr) {
  const cb = clr.blocks.filter(x => !x.v), vh = clr.blocks.filter(x => x.v), res = Math.round(clr.res / 100) * 100;
  const a = cb.length ? `${cb.length} city block${cb.length > 1 ? 's' : ''}` : '', b = vh.length ? `${vh.length} village house${vh.length > 1 ? 's' : ''}` : '';
  return `${[a, b].filter(Boolean).join(' and ')} (about ${Math.max(res, 10).toLocaleString('en-US')} residents)`;
};
/* the ground a part takes up, for clearing homes: a runway takes its 150 m strip */
function footprint(ap, p) {
  if (p.kind === 'runway') return { line: [[p.a, p.b]], r: 1.5 };
  if (p.kind === 'taxi') { const pts = p.pts || p.nodes.map(id => ap.nodes[id]); const segs = []; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); return { line: segs, r: 0.45 }; }
  const D = IC.APART[p.kind];
  const w = p.w || (p.r ? p.r * 2 : D.w || 0.3), h = p.h || (p.r ? p.r * 2 : D.h || 0.3);
  return { rect: { x: p.x, y: p.y, a: p.a || 0, w: w + 0.2, h: h + 0.2 } };
}
function fpHit(f, x, y, rad) {
  if (f.rect) { const l = IC.rectLocal(f.rect, { x, y }); return Math.abs(l.x) < f.rect.w / 2 + rad && Math.abs(l.y) < f.rect.h / 2 + rad; }
  for (const [a, b] of f.line) if (U.segDist(x, y, a.x, a.y, b.x, b.y) < f.r + rad) return true;
  return false;
}
function fpBox(f) {
  const pts = f.rect ? [IC.rectWorld(f.rect, -f.rect.w / 2, -f.rect.h / 2), IC.rectWorld(f.rect, f.rect.w / 2, -f.rect.h / 2), IC.rectWorld(f.rect, f.rect.w / 2, f.rect.h / 2), IC.rectWorld(f.rect, -f.rect.w / 2, f.rect.h / 2)] : f.line.flat();
  const m = f.rect ? 0 : f.r;
  return { x0: Math.min(...pts.map(p => p.x)) - m, y0: Math.min(...pts.map(p => p.y)) - m, x1: Math.max(...pts.map(p => p.x)) + m, y1: Math.max(...pts.map(p => p.y)) + m };
}
/* the homes and roads a planned part would take: blocks to clear, roads to carry under it in a tunnel */
IC.bldClearance = function (S, ap, p) {
  const f = footprint(ap, p), box = fpBox(f), out = { blocks: [], comp: 0, towns: {}, roads: 0, tunnel: 0, box, res: 0, weight: 0 };
  const W = S.world; if (!W) return out;
  const towns = IC.cities(S).concat((W.villages || []).filter(v => v.home));
  for (const c of towns) {
    if (!c.blocks || c.x + (c.r || 20) * 1.6 < box.x0 || c.x - (c.r || 20) * 1.6 > box.x1 || c.y + (c.r || 20) * 1.6 < box.y0 || c.y - (c.r || 20) * 1.6 > box.y1) continue;
    for (const b of c.blocks) {
      if (b.hp <= 0 || !fpHit(f, b.x, b.y, Math.max(b.w, b.h) * 0.35)) continue;
      const v = c.kind !== 'city', x = { b, c, v };
      out.blocks.push(x); out.comp += COMP(v ? { village: true } : b); out.weight += WEIGHT(x);
      out.res += v ? 4 : (c.pop || 100) * 1000 / Math.max(1, c.blocks.length) * (b.sub ? 0.4 : 1);
      out.towns[c.name] = (out.towns[c.name] || 0) + 1;
    }
  }
  // roads cross under runways and taxiways in a tunnel; under buildings they cannot
  if (p.kind === 'runway' || p.kind === 'taxi' || p.kind === 'apron') for (const e of W.edges) {
    if (!e.bb) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of e.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } e.bb = [x0, y0, x1, y1]; }
    if (e.bb[2] < box.x0 || e.bb[0] > box.x1 || e.bb[3] < box.y0 || e.bb[1] > box.y1) continue;
    if (e.pts.some(q => fpHit(f, q.x, q.y, 0.1))) { out.roads++; out.tunnel += p.kind === 'runway' ? 20 : 8; }
  }
  return out;
};
/* a built runway a part is next to: works there shut it while paving */
function nearRunway(ap, p) {
  for (const rw of ap.parts) {
    if (rw.kind !== 'runway' || !rw.built || rw === p) continue;
    if (p.kind === 'runway') { if (IC.rwDependent(rw, p) === 'cross') return rw; continue; }
    if (p.kind === 'taxi') { const pts = p.pts || p.nodes.map(id => ap.nodes[id]); for (const q of pts) if (q && IC.partDist(ap, rw, q) < 0.9) return rw; continue; }
    // within 90 m of the runway's edge
    const c = IC.rwAt(rw, 0.5), zone = { x: c.x, y: c.y, a: Math.atan2(rw.b.y - rw.a.y, rw.b.x - rw.a.x), w: IC.rwLen(rw) + 1.8, h: rw.w + 1.8 };
    const D = IC.APART[p.kind], me = { x: p.x, y: p.y, a: p.a || 0, w: p.w || (p.r ? p.r * 2 : D.w || 0.3), h: p.h || (p.r ? p.r * 2 : D.h || 0.3) };
    if (p.x != null && IC.rectsOverlap(zone, me, 0)) return rw;
  }
  return null;
}
/* everything about a planned part before it is committed: cost and time by stage, materials, homes, roads */
IC.bldPreview = function (S, ap, p) {
  const D = IC.APART[p.kind];
  if (IC.PAVED[p.kind] && !p.mat) p.mat = 'conc';
  const cost = IC.partCost(ap, p), dur = IC.partBuildTime(ap, p), need = IC.partNeed(ap, p);
  const clr = IC.bldClearance(S, ap, p), bld = !IC.PAVED[p.kind];
  const stages = [];
  if (clr.blocks.length) stages.push({ k: 'demo', name: 'Clearing buildings', dur: Math.max(300, 900 * clr.weight), cost: clr.comp });
  for (const s of STAGE) stages.push({ k: s.k, name: bld ? s.bname : s.name, dur: Math.max(20, dur * s.t), cost: cost * s.c + (s.k === 'earth' ? clr.tunnel : 0), mats: s.mats ? need : null, rw: s.rw });
  const rw = nearRunway(ap, p);
  return { cost: stages.reduce((a, s) => a + s.cost, 0), dur: stages.reduce((a, s) => a + s.dur, 0), need, clr, stages, near: rw, D };
};
/* hours of night, when works beside a runway can run without closing it by day */
const isNight = S => { const h = ((S.time % 86400) + 86400) % 86400 / 3600; return h >= 23 || h < 6; };
function shut(ap, rw, w, on) {
  if (!rw) return;
  const was = rw.shut;
  if (on) rw.shut = w.id; else if (rw.shut === w.id) rw.shut = null;
  if (was !== rw.shut) { ap.dirty = true; ap.cfg = null; }
}
/* one step of a build: returns true when the crew worked (false: waiting for money, materials or night) */
IC.bldAdvance = function (S, ap, w, dt) {
  const rw = w.near ? ap.parts.find(p => p.id === w.near) : null;
  // finished from outside (tests, cheats): run what is left of the stages at once
  if (w.prog >= 1) { for (; w.si < w.stages.length; w.si++) stageDone(S, ap, w, w.stages[w.si]); shut(ap, rw, w, false); return true; }
  const st = w.stages[w.si];
  if (st.rw && rw) {
    if (w.rwMode === 'night' && !isNight(S)) { shut(ap, rw, w, false); w.wait = `waiting for night: paving beside ${rw.name} runs 23:00–06:00`; return false; }
    shut(ap, rw, w, true);
  } else shut(ap, rw, w, false);
  let f = dt / st.dur;
  f = Math.min(f, 1 - w.t / st.dur);
  // materials: the stage goes only as far as the stockpile allows
  const M = yardOf(ap);
  for (const k in st.mats || {}) if (st.mats[k] > 0) f = Math.min(f, M[k] / st.mats[k]);
  if (f <= 1e-9) {
    const k = Object.keys(st.mats).find(x => st.mats[x] > 0 && M[x] <= 1e-6), sp = IC.bldSupply(S, ap), next = (ap.convoys || []).filter(c => c.loads[k] > 0).sort((a, b) => a.arr - b.arr)[0];
    w.wait = `waiting for ${IC.MATS[k]}: ${next ? `lorries from ${next.from || sp.name} in ${U.dur(next.arr - S.time)}` : sp.rate ? `ordered from ${sp.name}, ${U.km(sp.km * 10)} by road` : 'no industrial town can reach this site by road'}`;
    // one message per airport and material while the shortage lasts, not one per job
    ap.shortT = ap.shortT || {};
    if (!w.short && !(S.time - (ap.shortT[k] || -1e9) < 3 * 3600)) { ap.shortT[k] = S.time; const n = ap.works.filter(x => x.stages && x.stages[x.si] && x.stages[x.si].mats && x.stages[x.si].mats[k] > 0).length; IC.log(S, 'warn', 'BUILD', `${ap.name}: out of ${IC.MATS[k]}; ${n > 1 ? `${n} jobs wait` : `${w.label.toLowerCase()} waits`}. ${sp.rate ? `Lorries from ${sp.name} bring about ${sp.rate} loads an hour.` : 'No town with industry can reach it by road.'}`, w.part && w.part.x != null ? w.part : ap); }
    w.short = true;
    return false;
  }
  const pay = st.cost * f;
  if (S.budget < pay) { w.wait = `waiting for money: ${U.money(st.cost * (1 - w.t / st.dur))} to finish ${st.name.toLowerCase()}`; return false; }
  S.budget -= pay; w.spent = (w.spent || 0) + pay;
  for (const k in st.mats || {}) M[k] = Math.max(0, M[k] - st.mats[k] * f);
  w.t += f * st.dur; w.wait = null; w.short = false; w.busyT = S.time;
  if (w.part) w.part.stageF = w.t / st.dur;
  if (w.t >= st.dur - 1e-6) { stageDone(S, ap, w, st); w.si++; w.t = 0; if (w.part) w.part.stageF = 0; if (w.si >= w.stages.length) shut(ap, rw, w, false); }
  let done = 0; for (let i = 0; i < w.si; i++) done += w.stages[i].dur;
  w.prog = w.si >= w.stages.length ? 1 : Math.min(0.999, (done + w.t) / w.dur);
  w.stage = w.stages[Math.min(w.si, w.stages.length - 1)].k;
  if (w.part) w.part.stage = w.stage;
  return true;
};
/* the homes come down at the end of the first stage; the town's map changes with them */
function stageDone(S, ap, w, st) {
  if (st.k !== 'demo' || !w.demo) return;
  const by = new Map();
  for (const { b, c } of w.demo) { if (!by.has(c)) by.set(c, []); by.get(c).push(b); }
  for (const [c, L] of by) { const gone = new Set(L); c.blocks = c.blocks.filter(b => !gone.has(b)); if (c.light) c.light = null; }
  IC.worldChanged(S, w.clrBox);
  IC.log(S, 'info', 'BUILD', `${ap.name}: ${IC.bldClearText({ blocks: w.demo, res: w.demoRes || 0 })} cleared for the ${IC.APART[w.part.kind].name.toLowerCase()}.`, w.part.x != null ? w.part : ap);
  w.demo = null;
}
/* the neighbours hear about it the day the plan is signed */
function protest(S, ap, p, clr) {
  const n = clr.blocks.length; if (!n) return;
  const k = clr.weight;
  S.support = Math.max(0, S.support - Math.min(8, 0.4 + 0.8 * k));
  const towns = new Set(clr.blocks.map(x => x.c));
  for (const c of towns) if (c.morale != null) c.morale = Math.max(0, c.morale - Math.min(12, 1 + 2 * clr.blocks.filter(x => x.c === c).reduce((a, x) => a + WEIGHT(x), 0)));
  if (S.story) S.story.standing = Math.max(0, S.story.standing - Math.min(5, 0.3 * k));
  const where = Object.keys(clr.towns).join(' and ');
  IC.log(S, 'warn', 'BUILD', `${ap.name}: ${IC.bldClearText(clr)} in ${where} to be cleared for the ${IC.APART[p.kind].name.toLowerCase()}; ${U.money(clr.comp)} in compensation. Residents are angry.`, p.x != null ? p : ap);
  if (k >= 3 && S.camp) IC.card(S, `Protest in ${Object.keys(clr.towns)[0]}`, ap.name, `Residents marched on the town hall: ${IC.bldClearText(clr)} are to be bulldozed for a ${IC.APART[p.kind].name.toLowerCase()}. Compensation of ${U.money(clr.comp)} is paid as the buildings come down. Public support has dropped. A smaller layout, or building away from town, avoids this.`, 'alarm');
  IC.emit(S, 'aptClear', { ap, part: p, n });
}
/* a major opening: a card with the before and after numbers */
IC.bldOpened = function (S, ap, w, before) {
  const p = w.part, st = IC.aptStats(S, ap);
  const line = (k, a, b) => a !== b ? `${k}: ${a} → ${b}.` : '';
  const T = t => t ? IC.ACTYPES[t].name.toLowerCase() : 'none';
  const txt = [line('Movements an hour', before.movesPerHour || 0, st.movesPerHour), line('Largest aircraft', T(before.maxType), T(st.maxType)),
    line('Stands', before.nst, IC.aptStands(ap).filter(s => s.linked !== false).length), line('Passengers an hour', Math.round(before.pax || 0), Math.round(st.pax))].filter(Boolean).join(' ');
  IC.sfx && IC.sfx.ui && IC.sfx.ui('ok');
  if (!['runway', 'terminal', 'cargo'].includes(p.kind) || !S.camp) return;
  const name = p.kind === 'runway' ? p.name : IC.APART[p.kind].name;
  IC.card(S, `${name} opens`, `${ap.name} · ${U.clock(S.time, S)}`, `${txt || 'Nothing uses it yet: it needs a taxiway to the aprons.'}${w.spent ? ` It cost ${U.money(w.spent)} and took ${U.dur(S.time - w.t0)}.` : ''}`, 'chapter');
};
IC.bldSnapStats = ap => { const st = ap.st || {}; return { movesPerHour: st.movesPerHour, maxType: st.maxType, pax: st.pax, nst: IC.aptStands(ap).filter(s => s.linked !== false).length }; };
/* start a planned part's work: called by IC.aptPlan once the part is added */
IC.bldStart = function (S, ap, part, pv) {
  const w = { id: IC.nid('w'), key: 'bd:' + part.id, kind: 'build', label: `Build ${IC.APART[part.kind].name.toLowerCase()}`, prog: 0, dur: pv.dur, part, cost: pv.cost,
    stages: pv.stages, si: 0, t: 0, spent: 0, t0: S.time, near: pv.near ? pv.near.id : null, rwMode: 'close', demo: pv.clr.blocks.length ? pv.clr.blocks : null, demoRes: pv.clr.res, clrBox: pv.clr.box };
  if (part.kind === 'runway') w.label = `Build ${part.name || 'runway'}`;
  protest(S, ap, part, pv.clr);
  if (part.kind === 'runway') for (const [name, n] of Object.entries(runwayNoise(S, part))) {
    const c = IC.cities(S).find(q => q.name === name);
    S.support = Math.max(0, S.support - Math.min(4, 0.3 + n * 0.02));
    if (c) c.morale = Math.max(0, c.morale - Math.min(6, 1 + n * 0.04));
    IC.log(S, 'warn', 'AVIATION', `Residents of ${name} object to ${part.name || 'the new runway'}: ${n} city blocks lie under its flight paths.`, c || ap);
  }
  (ap.undo = ap.undo || []).push(part.id);
  return w;
};
/* upgrading a part's pavement: the part is closed while the work runs */
IC.bldUpgrade = function (S, ap, part, mat) {
  if (!IC.PAVED[part.kind] || !IC.PAVE[mat] || !part.built || IC.paveOf(part) === mat || ap.works.some(w => w.part === part)) return false;
  if (IC.aptLockWhy(S, part.kind, mat)) { IC.log(S, 'warn', 'BUILD', IC.aptLockWhy(S, part.kind, mat)); return false; }
  const probe = Object.assign({}, part, { mat });
  const cost = IC.partCost(ap, probe) * 0.8, dur = IC.partBuildTime(ap, probe) * 0.6, need = IC.partNeed(ap, probe);
  if (S.budget < cost * 0.1) { IC.log(S, 'warn', 'BUILD', `Not enough money to start: ${U.money(cost * 0.1)} needed now.`); return false; }
  const stages = [{ k: 'earth', name: 'Breaking out the old surface', dur: dur * 0.35, cost: cost * 0.3 }, { k: 'pave', name: 'Paving', dur: dur * 0.5, cost: cost * 0.55, mats: need }, { k: 'mark', name: 'Markings', dur: dur * 0.08, cost: cost * 0.07 }, { k: 'lights', name: 'Lights', dur: dur * 0.07, cost: cost * 0.08 }];
  const w = { id: IC.nid('w'), key: 'up:' + part.id, kind: 'upgrade', label: `${IC.PAVE[mat].name} for ${part.name || IC.APART[part.kind].name.toLowerCase()}`, prog: 0, dur, part, cost, stages, si: 0, t: 0, spent: 0, t0: S.time, mat };
  ap.works.push(w);
  part.shut = w.id; ap.dirty = true; ap.cfg = null;
  IC.log(S, 'info', 'BUILD', `${ap.name}: ${w.label.toLowerCase()} (${U.money(cost)}). It is closed until the work is done, about ${U.dur(dur)}.`, part.x != null ? part : ap);
  return true;
};
/* works finished or cancelled: reopen what they closed */
IC.bldRelease = function (ap, w) {
  for (const p of ap.parts) if (p.shut === w.id) { p.shut = null; ap.dirty = true; ap.cfg = null; }
};

/* ---------- wear ---------- */
/* aircraft heavier than a pavement is rated for break it up; a fully worn runway closes */
IC.on((S, type, d) => {
  if (type === 'rwMove' && d.rw) {
    const P = IC.PAVE[IC.paveOf(d.rw)], over = (IC.MTOW[d.type] || 50) / P.t;
    if (over <= 1) return;
    const was = d.rw.wear || 0;
    d.rw.wear = Math.min(1, was + 0.0025 * over * over);
    if (was < 0.5 && d.rw.wear >= 0.5) IC.log(S, 'warn', 'AIRPORT', `${d.ap.name}: the ${P.name.toLowerCase()} on ${d.rw.name} is breaking up under ${IC.ACTYPES[d.type].name.toLowerCase()}s. Resurface it, or rebuild it in concrete.`, IC.rwAt(d.rw, 0.5));
    if (was < 1 && d.rw.wear >= 1) { d.ap.dirty = true; d.ap.cfg = null; IC.log(S, 'leak', 'AIRPORT', `${d.ap.name}: ${d.rw.name} is worn out and closed until it is resurfaced.`, IC.rwAt(d.rw, 0.5)); }
  } else if (type === 'landed' && d.r && d.r.slot) {
    // parked in the open, aircraft turn round quicker than inside a hangar or shelter
    const b = IC.baseOf(S, d.r.base), pp = b && b.parts ? IC.parkPos(S, b, d.r) : null;
    if (pp && pp.stand && d.r.t > 0) d.r.t *= 0.8;
  }
});

/* ageing, by the calendar (the Career): pavement wears out over its life in months, buildings lose condition and
   need renewing after some fifteen years, and the airlines retire their oldest aircraft */
IC.BUILDING_LIFE = 180;   // months before an untended building is down to nothing
IC.AIRCRAFT_LIFE = 240;   // months an airliner flies before its airline replaces it
IC.onMonth((S) => {
  if (S.mode !== 'story') return;
  for (const ap of IC.bases(S)) {
    if (ap.owner !== 'us' || !ap.parts) continue;
    for (const p of ap.parts) {
      if (!p.built || p.shut) continue;
      if (IC.PAVED[p.kind]) {
        const P = IC.PAVE[IC.paveOf(p)], was = p.wear || 0;
        // (only a runway closes when worn out; taxiways and aprons stay in use, worn)
        p.wear = Math.min(p.kind === 'runway' ? 1 : 0.95, was + 1 / P.life);
        if (was < 0.5 && p.wear >= 0.5) IC.log(S, 'warn', 'AIRPORT', `${ap.name}: ${p.name || IC.APART[p.kind].name.toLowerCase()} is ${U.pct(p.wear)} worn with age and weather. Resurface it before it has to close.`, p.kind === 'runway' ? IC.rwAt(p, 0.5) : p.x != null ? p : ap);
        if (was < 1 && p.wear >= 1) { ap.dirty = true; ap.cfg = null; IC.log(S, 'leak', 'AIRPORT', `${ap.name}: ${p.name || IC.APART[p.kind].name.toLowerCase()} is worn out and closed until it is resurfaced.`, p.kind === 'runway' ? IC.rwAt(p, 0.5) : ap); }
      } else if (p.max && p.hp > 0) {
        const was = p.hp / p.max;
        p.hp = Math.max(p.max * 0.05, p.hp - p.max / IC.BUILDING_LIFE); p.aged = true;
        if (was >= 0.5 && p.hp / p.max < 0.5) IC.log(S, 'warn', 'AIRPORT', `${ap.name}: the ${IC.APART[p.kind].name.toLowerCase()} is showing its age (${U.pct(p.hp / p.max)} condition). Renew it in the airport's Works tab.`, p.x != null ? p : ap);
      }
    }
  }
  // airliners: each tail's age in months; the airline replaces one that reaches the end of its life
  if (S.av) for (const t of S.av.tails) {
    if (t.where === 'lost') continue;
    if (t.bornM == null) t.bornM = S.cal.m - Math.floor(Math.random() * 120);
    if (S.cal.m - t.bornM >= IC.AIRCRAFT_LIFE && (t.where === 'stand' || t.where === 'away')) {
      t.bornM = S.cal.m;
      const al = S.av.airlines.find(a => a.id === t.al);
      if (al) { al.sat = Math.min(100, al.sat + 1); IC.log(S, 'info', 'AVIATION', `${al.name} retires ${t.cs}'s twenty-year-old ${t.T.name.toLowerCase()} and puts a new one on the route.`); }
    }
  }
});

/* ---------- the site: survey for a new airport ---------- */
IC.PREVAIL = Math.PI - 0.2;   // the prevailing wind blows from the west-north-west (weather.js)
const RW0 = 30;               // survey a 3 km runway
/* noise under the approach and departure paths: 8 km beyond each end, 1.5 km either side */
function noiseHit(x, y, a, b, len) { const d = { x: Math.cos(a), y: Math.sin(a) }, dx = b.x - x, dy = b.y - y, lx = dx * d.x + dy * d.y, ly = -dx * d.y + dy * d.x; return Math.abs(lx) < (len || RW0) / 2 + 80 && Math.abs(ly) < 15 * (0.4 + 0.6 * Math.min(1, Math.abs(lx) / 60)); }
/* city blocks (village houses count a fifth) under a runway's flight paths, by town */
IC.noiseOver = function (S, x, y, a, len) {
  const W = S.world, out = {};
  for (const c of IC.cities(S).concat((W.villages || []).filter(v => v.home))) {
    if (U.dist(c, { x, y }) > (len || RW0) / 2 + 100 + (c.r || 10)) continue;
    let n = 0; for (const b of c.blocks || []) if (b.hp > 0 && noiseHit(x, y, a, b, len)) n += c.kind === 'city' ? 1 : 0.2;
    if (n >= 1) out[c.name] = Math.round(n);
  }
  return out;
};
IC.foundSurvey = function (S, x, y, a) {
  const W = S.world, d = { x: Math.cos(a), y: Math.sin(a) };
  const h0 = W.hAt(x, y);
  let hmin = h0, hmax = h0, obst = 0, obstAt = 0, river = false;
  for (let s = -RW0 / 2; s <= RW0 / 2; s += 3) { const h = W.hAt(x + d.x * s, y + d.y * s); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  // a runway cannot cross a river: sample the line every 50 m
  for (let s = -RW0 / 2; s <= RW0 / 2 && !river; s += 0.5) river = !!(IC.onRiver && IC.onRiver(x + d.x * s, y + d.y * s));
  // hills under the approach: ground rising faster than a 3° slope from the runway end
  for (const e of [-1, 1]) for (let s = RW0 / 2 + 5; s < RW0 / 2 + 100; s += 5) {
    const h = W.hAt(x + d.x * s * e, y + d.y * s * e), rise = (h - hmax) * 2000 - (s - RW0 / 2) * 100 * 0.052;
    if (rise > obst) { obst = rise; obstAt = (s - RW0 / 2) / 10; }
  }
  const noise = IC.noiseOver(S, x, y, a), homes = Object.values(noise).reduce((s, n) => s + n, 0);
  const city = IC.cities(S).slice().sort((p, q) => U.dist(p, { x, y }) - U.dist(q, { x, y }))[0];
  const cd = city ? U.dist(city, { x, y }) : 1e9;
  const earth = Math.round((hmax - hmin) * 2000 * 0.4);   // levelling: ₭0.4M a metre of height difference
  const land = Math.round(10 + (city && cd < city.r * 2.5 ? 40 * (1 - cd / (city.r * 2.5)) : 0));
  const off = Math.abs(U.angWrap(((a - IC.PREVAIL) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2)) * 180 / Math.PI;
  const wind = Math.round(Math.min(off, 180 - off));
  const hdg = IC.bearing(a), end = n => String(Math.round(n / 10) % 36 || 36).padStart(2, '0');
  return { x, y, a, river, slope: W.slopeAt(x, y), hdiff: (hmax - hmin) * 2000, earth, land, cost: IC.FOUND_COST + earth + land, obst: Math.round(obst), obstAt, noise, homes, city: city && city.name, cityKm: cd / 10,
    windOff: wind, name: `${end(hdg)}/${end(hdg + 180)}`, cross: Math.round(Math.sin(wind * Math.PI / 180) * 15) };
};
/* the survey in plain words, one line each */
IC.foundLines = function (S, sv) {
  const L = [];
  L.push(`Runway ${sv.name} · ${sv.windOff <= 15 ? 'into the prevailing wind' : `${sv.windOff}° off the prevailing wind (${sv.cross} kt across in a typical 15 kt breeze)`}`);
  L.push(`Ground: ${sv.hdiff < 3 ? 'flat' : `${Math.round(sv.hdiff)} m to level (${U.money(sv.earth)})`} · land ${U.money(sv.land)}`);
  if (sv.river) L.push('A river crosses the runway line: a runway cannot be built across it. Turn the runway or move the site');
  if (sv.obst > 20) L.push(`Hills ${sv.obstAt.toFixed(0)} km off one end rise ${sv.obst} m above the approach slope`);
  L.push(sv.homes ? `Noise over ${Object.entries(sv.noise).map(([k, v]) => `${v} city blocks of ${k}`).join(', ')}` : 'No homes under the flight paths');
  L.push(`Total ${U.money(sv.cost)}`);
  return L;
};

/* ---------- the builder's tools ---------- */
/* airport axis helpers */
const axis = ap => ap.rwyA || 0;
const loc = (ap, p) => IC.rectLocal({ x: ap.x, y: ap.y, a: axis(ap) }, p);
const wld = (ap, lx, ly) => IC.rectWorld({ x: ap.x, y: ap.y, a: axis(ap) }, lx, ly);
IC.BTOOLS = {
  parallel: { name: 'Parallel taxiway', desc: 'Click a runway, then move out to the distance you want and click again. A full-length taxiway with links to both runway ends.' },
  exits: { name: 'Rapid exits', desc: 'Click a runway with a parallel taxiway: exits angled at 30° where the aircraft using it slow down, in both directions.' },
  hold: { name: 'Holding bay', desc: 'Click near a runway end with a parallel taxiway: a second entry beside the first, so an aircraft that is ready can pass one that is waiting.' },
  concourse: { name: 'Concourse', desc: 'Click the two ends of a pier: a terminal with gates (jet bridges) on both sides and a taxilane along each apron.' },
  remote: { name: 'Remote apron', desc: 'Two corners: an apron with a taxilane along its front. Stands served by bus.' },
  ramp: { name: 'Open ramp', desc: 'Two corners: a paved ramp where you place stands yourself, any size, for any aircraft that may park in the open.' },
  stretch: { name: 'Stretch apron', desc: 'Click the edge of an apron, then click how far out it should go: the new paving joins it seamlessly. Aprons that touch are one paved area.' },
  stand: { name: 'Stand', desc: 'Click on any apron to place a stand of the chosen size; next to a terminal it noses in to a gate. R turns it. Nose-in stands need a tug to push back; drive-through stands take more room but no tug. Click a stand to remove it.' }
};
/* the parallel taxiway to the side of a runway where the cursor is */
function parallelSpec(ap, rw, p) {
  const d = IC.rwDir(rw), L = IC.rwLen(rw), side = Math.sign((p.x - rw.a.x) * -d.y + (p.y - rw.a.y) * d.x) || 1;
  const off = U.clamp(Math.round(Math.abs((p.x - rw.a.x) * -d.y + (p.y - rw.a.y) * d.x) * 10) / 10, 1.2, 6);
  const n = { x: -d.y * side * off, y: d.x * side * off };
  const pts = [{ x: rw.a.x, y: rw.a.y }];
  const k = Math.max(2, Math.round(L / 6));
  for (let i = 0; i <= k; i++) { const q = IC.rwAt(rw, i / k); pts.push({ x: q.x + n.x, y: q.y + n.y }); }
  pts.push({ x: rw.b.x, y: rw.b.y });
  return { specs: [{ kind: 'taxi', pts }], off, text: [`Parallel taxiway ${Math.round(off * 100)} m from ${rw.name}${off < 1.68 ? ' · closer than 168 m: wide-bodies on it may clip aircraft on the runway' : ''}`] };
}
/* the parallel taxiway serving a runway, if there is one: side and distance */
function findParallel(ap, rw) {
  const d = IC.rwDir(rw), L = IC.rwLen(rw), best = {};
  for (const q of ap.parts) {
    if (q.kind !== 'taxi') continue;
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]], sl = U.dist(a, b);
      if (sl < 0.5 || Math.abs(((b.x - a.x) * d.y - (b.y - a.y) * d.x) / sl) > 0.05) continue;
      const off = (a.x - rw.a.x) * -d.y + (a.y - rw.a.y) * d.x;
      if (Math.abs(off) < 1 || Math.abs(off) > 5) continue;
      const k = Math.round(off * 10);
      (best[k] = best[k] || { off, cover: 0 }).cover += sl;
    }
  }
  const b = Object.values(best).sort((x, y) => y.cover - x.cover)[0];
  return b && b.cover > L * 0.3 ? b : null;
}
/* the exits a runway needs for the traffic using it: one where each type slows down, in each direction */
function exitSpec(S, ap, rw) {
  const par = findParallel(ap, rw);
  if (!par) return { specs: [], text: [`${rw.name} needs a parallel taxiway first: exits lead onto it.`], bad: true };
  const G = IC.aptGraph(ap), L = IC.rwLen(rw), d = IC.rwDir(rw);
  // a runway still being built has no graph yet: its exits are the planned taxiways that join it
  const nodes = G.rwn.get(rw.id) || Object.values(ap.nodes).filter(n => n.on && n.on.part === rw.id).map(n => ({ s: n.on.t * L, exit: true }));
  const mix = {}; for (const x of ap.mvLog || []) if (IC.ACTYPES[x.type] && !IC.ACTYPES[x.type].mil && !IC.ACTYPES[x.type].vtol) mix[x.type] = 1;
  const types = (Object.keys(mix).length ? Object.keys(mix) : ['narrow', 'wide']).filter(k => IC.ACTYPES[k].rwy <= L - 2).sort((a, b) => IC.ACTYPES[a].rwy - IC.ACTYPES[b].rwy);
  const specs = [], text = [], at = [];
  for (const dir of [1, -1]) for (const k of types) {
    const T = IC.ACTYPES[k], s = dir > 0 ? 1.5 + T.rwy * 0.5 + 0.3 : L - 1.5 - T.rwy * 0.5 - 0.3;
    if (s < 3 || s > L - 3) continue;
    if (nodes.some(n => n.exit && Math.abs(n.s - s) < 1.2) || at.some(x => Math.abs(x - s) < 1.2)) continue;
    at.push(s);
    const q = IC.rwAt(rw, s / L), run = Math.abs(par.off) * 1.73, t = U.clamp(s + dir * run, 0.3, L - 0.3), r = IC.rwAt(rw, t / L);
    specs.push({ kind: 'taxi', pts: [{ x: q.x, y: q.y }, { x: r.x - d.y * par.off, y: r.y + d.x * par.off }], exit: { dir, s, type: k } });
  }
  // what the exits do to runway occupancy, worked out with the timings the simulation uses
  const cfgDir = ap.cfg && ap.cfg.rw[rw.id] ? ap.cfg.rw[rw.id].dir : 1;
  for (const dir of [cfgDir, -cfgDir]) {
    const mine = specs.filter(x => x.exit.dir === dir); if (!mine.length) continue;
    if (!G.rwn.get(rw.id)) { text.push(`${mine.length} exit${mine.length > 1 ? 's' : ''} landing ${IC.rwEnd(rw, dir)} at ${mine.map(x => U.km(dir > 0 ? x.exit.s : L - x.exit.s)).join(', ')}`); continue; }
    const T = IC.ACTYPES[types[types.length - 1]], before = IC.rwOcc(S, ap, rw, dir, T).land;
    const saved = G.rwn.get(rw.id);
    G.rwn.set(rw.id, saved.concat(mine.map((x, i) => ({ id: '_x' + i, t: x.exit.s / L, s: x.exit.s, exit: true, entry: false }))));
    const after = IC.rwOcc(S, ap, rw, dir, T).land;
    G.rwn.set(rw.id, saved);
    text.push(`${mine.length} exit${mine.length > 1 ? 's' : ''} landing ${IC.rwEnd(rw, dir)} at ${mine.map(x => U.km(dir > 0 ? x.exit.s : L - x.exit.s)).join(', ')}` + (before < 1e8 && after < before - 1 ? `: cuts runway time for a ${T.short} by ${U.dur(before - after)}` : ''));
  }
  if (!specs.length) text.push(`${rw.name} already has exits where aircraft slow down.`);
  return { specs, text, bad: !specs.length };
}
/* a holding bay: a bypass entry from the parallel taxiway onto the runway a little way in from its end */
function holdSpec(ap, rw, p) {
  const par = findParallel(ap, rw);
  if (!par) return { specs: [], text: [`${rw.name} needs a parallel taxiway first.`], bad: true };
  const L = IC.rwLen(rw), d = IC.rwDir(rw), atA = U.dist(p, rw.a) < U.dist(p, rw.b), s = atA ? 1.2 : L - 1.2, s2 = atA ? 3 : L - 3;
  const q = IC.rwAt(rw, s / L), r = IC.rwAt(rw, s2 / L);
  return { specs: [{ kind: 'taxi', pts: [{ x: r.x - d.y * par.off, y: r.y + d.x * par.off }, { x: q.x - d.y * par.off * 0.45, y: q.y + d.x * par.off * 0.45 }, { x: q.x, y: q.y }] }],
    text: [`Holding bay at the ${IC.rwEnd(rw, atA ? 1 : -1)} end: a second way onto the runway ${Math.round(s < L / 2 ? s * 100 : (L - s) * 100)} m from its end`] };
}
/* a pier: terminal along the spine, aprons each side deep enough for the stand size, a taxilane beyond each */
function concourseSpec(ap, a, b, size) {
  const L = U.dist(a, b), ang = Math.atan2(b.y - a.y, b.x - a.x), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const D = Math.ceil(IC.STAND[size].d / 0.64 * 100 + 2) / 100, tw = 0.5, r = { x: c.x, y: c.y, a: ang };
  const specs = [{ kind: 'terminal', x: c.x, y: c.y, a: ang, w: L, h: tw }];
  for (const s of [-1, 1]) {
    const ac = IC.rectWorld(r, 0, s * (tw / 2 + D / 2));
    specs.push({ kind: 'apron', x: ac.x, y: ac.y, a: ang, w: L, h: D });
    const ly = s * (tw / 2 + D + 0.05);
    specs.push({ kind: 'taxi', pts: [IC.rectWorld(r, -L / 2 - 0.6, ly), IC.rectWorld(r, 0, ly), IC.rectWorld(r, L / 2 + 0.6, ly)], lane: true });
  }
  const n = Math.floor(L / IC.STAND[size].w) * 2;
  return { specs, text: [`Concourse ${U.km(L)} · ${n} ${IC.STAND[size].name} gates with jet bridges · ${Math.round(IC.APART.terminal.pax * L * tw).toLocaleString('en-US')} passengers an hour`], gates: n };
}
/* an apron block with its taxilane along the side facing the airfield */
function remoteSpec(ap, rc) {
  const specs = [Object.assign({ kind: 'apron' }, rc)];
  const toC = IC.rectLocal(rc, ap), s = Math.abs(toC.y) > 0.01 ? Math.sign(toC.y) : 1, ly = s * (rc.h / 2 + 0.05);
  specs.push({ kind: 'taxi', pts: [IC.rectWorld(rc, -rc.w / 2 - 0.6, ly), IC.rectWorld(rc, 0, ly), IC.rectWorld(rc, rc.w / 2 + 0.6, ly)], lane: true });
  return specs;
}
/* round a taxiway's corners: each bend where it is not joining something becomes an arc */
IC.bldFillet = function (pts, joins, R) {
  R = R || 0.45;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y }, lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
    const turn = Math.PI - Math.acos(U.clamp((u.x * v.x + u.y * v.y) / (lu * lv || 1), -1, 1));
    if (joins[i] || turn < 0.25 || lu < 0.1 || lv < 0.1) { out.push(b); continue; }
    // the tangent points, no further than half of either leg
    const t = Math.min(R * Math.tan(turn / 2), lu * 0.45, lv * 0.45), r = t / Math.tan(turn / 2);
    const p1 = { x: b.x + u.x / lu * t, y: b.y + u.y / lu * t }, p2 = { x: b.x + v.x / lv * t, y: b.y + v.y / lv * t };
    const bis = { x: u.x / lu + v.x / lv, y: u.y / lu + v.y / lv }, bl = Math.hypot(bis.x, bis.y) || 1, h = Math.hypot(r, t);
    const o = { x: b.x + bis.x / bl * h, y: b.y + bis.y / bl * h };
    const a1 = Math.atan2(p1.y - o.y, p1.x - o.x), a2 = Math.atan2(p2.y - o.y, p2.x - o.x), da = U.angWrap(a2 - a1), k = Math.max(2, Math.ceil(Math.abs(da) / 0.3));
    for (let j = 0; j <= k; j++) out.push({ x: o.x + Math.cos(a1 + da * j / k) * r, y: o.y + Math.sin(a1 + da * j / k) * r });
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/* ---------- snapping ---------- */
/* a point for a line tool: the network first, then 15° steps from the runway axis and 10 m lengths */
function snapLine(ap, m, p, tol, free) {
  const s = IC.aptSnap(ap, p, tol);
  if (s.kind !== 'free' || free) return s;
  const prev = m.pts[m.pts.length - 1];
  if (!prev) { const l = loc(ap, p), g = 0.1; const q = wld(ap, Math.round(l.x / g) * g, Math.round(l.y / g) * g); return { kind: 'free', x: q.x, y: q.y }; }
  const dx = p.x - prev.x, dy = p.y - prev.y, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - axis(ap), step = Math.PI / 12;
  const sa = Math.round(a / step) * step, use = Math.abs(U.angWrap(a - sa)) < 0.09 ? sa : a, Lr = Math.max(0.1, Math.round(L * 10) / 10);
  const q = { x: prev.x + Math.cos(use + axis(ap)) * Lr, y: prev.y + Math.sin(use + axis(ap)) * Lr };
  // lined up with a runway end or another node across: snap to it too
  return Object.assign({ kind: 'free', x: q.x, y: q.y }, use === sa && L > 0.3 ? { ang: Math.round(U.angWrap(sa) * 180 / Math.PI) } : null);
}
/* a corner for an area: corners of other areas, then a 5 m grid along the rotation */
function snapCorner(ap, m, p, tol, free) {
  tol = Math.min(tol, 0.35);
  if (!free) for (const q of ap.parts) {
    if (!q.w || !q.h || q.kind === 'runway' || q.kind === 'taxi') continue;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = IC.rectWorld(q, sx * q.w / 2, sy * q.h / 2); if (U.dist(c, p) < tol) return { kind: 'corner', x: c.x, y: c.y }; }
  }
  // then onto the edge of a taxiway or an apron, so a new apron or terminal meets it without a gap or an overlap
  if (!free) {
    let best = null, bd = tol;
    for (const e of edgesNear(ap, p, tol + 0.3)) {
      const L = U.dist(e.a, e.b); if (L < 0.1) continue;
      const ux = (e.b.x - e.a.x) / L, uy = (e.b.y - e.a.y) / L, t = (p.x - e.a.x) * ux + (p.y - e.a.y) * uy;
      if (t < -0.05 || t > L + 0.05) continue;
      const off = (p.x - e.a.x) * -uy + (p.y - e.a.y) * ux, side = Math.sign(off) || 1, d = Math.abs(Math.abs(off) - e.half);
      if (d < bd) { bd = d; best = { kind: 'edge', x: e.a.x + ux * t - uy * side * e.half, y: e.a.y + uy * t + ux * side * e.half, what: e.what }; }
    }
    if (best) return best;
  }
  const r = { x: ap.x, y: ap.y, a: m.rot }, l = IC.rectLocal(r, p), g = free ? 0.01 : 0.05;
  const q = IC.rectWorld(r, Math.round(l.x / g) * g, Math.round(l.y / g) * g);
  return { kind: 'free', x: q.x, y: q.y };
}
/* buildings face the nearest taxiway or apron edge, set back by a gap, and get a way in: aircraft buildings a short
   taxiway to their door, the others a service road. gap: metres of apron or verge between pavement and building /100 */
IC.SNAP_GAP = { hangar: 0.3, has: 0.3, deice: 0.25, fuelpad: 0.2, fire: 0.3, tower: 0.35, fuel: 0.45, hydrant: 0.35, atc: 0.6, gradar: 0.5, ammo: 0.8 };
const STUB = k => k === 'hangar' || k === 'has' || !!IC.APART[k].pad;
/* the pavement edges near a point: taxiway centrelines (with their half width) and apron edges */
function edgesNear(ap, p, R) {
  const out = [];
  for (const q of ap.parts) {
    if (q.kind === 'taxi') for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]];
      if (a && b && U.segDist(p.x, p.y, a.x, a.y, b.x, b.y) < R) out.push({ a, b, half: q.w / 2, part: q, what: 'taxiway' });
    } else if (q.kind === 'apron' && IC.partDist(ap, q, p) < R) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => IC.rectWorld(q, sx * q.w / 2, sy * q.h / 2));
      for (let i = 0; i < 4; i++) out.push({ a: c[i], b: c[(i + 1) % 4], half: 0, part: q, what: 'apron', outN: IC.rectWorld(q, 0, 0) });
    }
  }
  return out;
}
/* where a building goes when it snaps: facing the nearest edge within reach, slid along it by the cursor */
IC.bldSnapBuilding = function (ap, kind, p) {
  const D = IC.APART[kind], gap = IC.SNAP_GAP[kind];
  if (gap == null || !D) return null;
  const w = D.w || (D.r || 0.1) * 2, h = D.h || (D.r || 0.1) * 2;
  let best = null;
  for (const e of edgesNear(ap, p, h + gap + 1.2)) {
    const L = U.dist(e.a, e.b); if (L < 0.2) continue;
    const ux = (e.b.x - e.a.x) / L, uy = (e.b.y - e.a.y) / L;
    const t = U.clamp((p.x - e.a.x) * ux + (p.y - e.a.y) * uy, Math.min(L / 2, w / 2), Math.max(L / 2, L - w / 2));
    const fx = e.a.x + ux * t, fy = e.a.y + uy * t, off = (p.x - fx) * -uy + (p.y - fy) * ux;
    let side = Math.sign(off) || 1;
    // an apron's building stands outside it
    if (e.outN) { const o = (e.outN.x - fx) * -uy + (e.outN.y - fy) * ux; side = -Math.sign(o) || side; }
    // the edge whose building would stand nearest the cursor (so a second click on it picks the same one)
    const nx = -uy * side, ny = ux * side, dist = e.half + gap + h / 2, d = U.dxy(p.x, p.y, fx + nx * dist, fy + ny * dist);
    if (best && d >= best.d) continue;
    best = { d, x: fx + nx * dist, y: fy + ny * dist, a: Math.atan2(uy, ux), foot: { x: fx, y: fy }, edge: { x: fx + nx * e.half, y: fy + ny * e.half }, face: { x: fx + nx * (e.half + gap), y: fy + ny * (e.half + gap) }, door: { x: fx + nx * (e.half + gap - 0.05), y: fy + ny * (e.half + gap - 0.05) }, what: e.what, part: e.part };
  }
  if (!best) return null;
  const spec = { kind, x: best.x, y: best.y, a: best.a };
  const specs = [spec];
  if (STUB(kind)) specs.push({ kind: 'taxi', pts: [best.door, best.what === 'apron' ? best.edge : best.foot], lane: true, stub: true });
  else spec.link = [{ x: best.face.x, y: best.face.y }, { x: best.edge.x, y: best.edge.y }];
  return { specs, snap: { kind: 'edge', x: best.x, y: best.y, what: best.what }, text: `faces the ${best.what}${STUB(kind) ? `, with a ${Math.round(U.dist(best.door, best.foot) * 100)} m taxiway to its door` : ', with a service road'}` };
};

/* service roads for buildings that have none (starting layouts, old games): from the face nearest the pavement */
IC.aptAutoLinks = function (ap) {
  for (const p of ap.parts) {
    if (p.link || IC.SNAP_GAP[p.kind] == null || STUB(p.kind) || p.x == null) continue;
    let best = null, bd = 1.2;
    for (const e of edgesNear(ap, p, 1.5)) {
      const L = U.dist(e.a, e.b); if (L < 0.1) continue;
      const ux = (e.b.x - e.a.x) / L, uy = (e.b.y - e.a.y) / L, t = U.clamp((p.x - e.a.x) * ux + (p.y - e.a.y) * uy, 0, L);
      const fx = e.a.x + ux * t, fy = e.a.y + uy * t, off = (p.x - fx) * -uy + (p.y - fy) * ux, side = Math.sign(off) || 1, q = { x: fx - uy * side * e.half, y: fy + ux * side * e.half }, d = U.dist(q, p);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) continue;
    const w = p.w || (p.r || 0.1) * 2, h = p.h || (p.r || 0.1) * 2, l = IC.rectLocal({ x: p.x, y: p.y, a: p.a || 0 }, best);
    const face = Math.abs(l.x) / w > Math.abs(l.y) / h ? IC.rectWorld({ x: p.x, y: p.y, a: p.a || 0 }, Math.sign(l.x) * w / 2, 0) : IC.rectWorld({ x: p.x, y: p.y, a: p.a || 0 }, 0, Math.sign(l.y) * h / 2);
    // never across a runway
    const mid = { x: (face.x + best.x) / 2, y: (face.y + best.y) / 2 };
    if (ap.parts.some(q => q.kind === 'runway' && (IC.partDist(ap, q, mid) < 0.3 || U.segX && U.segX(face.x, face.y, best.x, best.y, q.a.x, q.a.y, q.b.x, q.b.y) >= 0))) continue;
    if (U.dist(face, best) > 0.05) p.link = [face, best];
  }
};

const LINE_TOOLS = { taxi: 1, runway: 1, concourse: 1 };
const AREA_TOOLS = { apron: 1, terminal: 1, cargo: 1, remote: 1, ramp: 1, surface: 1 };
IC.bldIsArea = t => !!AREA_TOOLS[t];
IC.bldIsLine = t => !!LINE_TOOLS[t];
function runwayAt(ap, p, tol) { let best = null, bd = tol + 0.3; for (const q of ap.parts) if (q.kind === 'runway') { const d = IC.partDist(ap, q, p); if (d < bd) { bd = d; best = q; } } return best; }

/* the apron edge nearest a point: the apron, which axis (x or y) the edge is across, its side, and the point on it */
function apronEdge(ap, p, tol) {
  let best = null, bd = tol;
  for (const q of ap.parts) {
    if (q.kind !== 'apron') continue;
    const l = IC.rectLocal(q, p);
    if (Math.abs(l.y) <= q.h / 2 + tol) { const d = Math.abs(Math.abs(l.x) - q.w / 2); if (d < bd) { bd = d; best = { apr: q, ax: true, s: Math.sign(l.x) || 1, p: IC.rectWorld(q, (Math.sign(l.x) || 1) * q.w / 2, U.clamp(l.y, -q.h / 2, q.h / 2)) }; } }
    if (Math.abs(l.x) <= q.w / 2 + tol) { const d = Math.abs(Math.abs(l.y) - q.h / 2); if (d < bd) { bd = d; best = { apr: q, ax: false, s: Math.sign(l.y) || 1, p: IC.rectWorld(q, U.clamp(l.x, -q.w / 2, q.w / 2), (Math.sign(l.y) || 1) * q.h / 2) }; } }
  }
  return best;
}

/* ---------- stands placed by hand ---------- */
/* a stand's footprint as a rectangle: length along its heading, width across */
const standRect = s => ({ x: s.x, y: s.y, a: s.a, w: IC.STAND[s.size].d, h: IC.STAND[s.size].w });
IC.bldStandAt = (ap, p) => { for (const q of ap.parts) if (q.kind === 'apron') for (const s of q.stands || []) { const l = IC.rectLocal(standRect(s), p); if (Math.abs(l.x) < IC.STAND[s.size].d / 2 && Math.abs(l.y) < IC.STAND[s.size].w / 2) return s; } return null; };
/* where a stand goes under the cursor: on an apron, turned as the player turned it, or nose to the terminal when one
   is close; a click on an existing stand removes it */
IC.bldStandPlan = function (S, m, hv) {
  const ap = m.ap, out = { ok: true, why: '', text: [], specs: [], cost: 0 };
  const apr = ap.parts.find(q => q.kind === 'apron' && IC.partDist(ap, q, hv) < 0.01);
  if (!apr) { out.ok = false; out.why = 'Stands go on an apron: draw or stretch one first.'; return out; }
  const old = IC.bldStandAt(ap, hv);
  if (old && old.apron === apr.id) {
    out.stand = { apron: apr, remove: old };
    if (old.occ) { out.ok = false; out.why = 'An aircraft is parked on that stand.'; } else out.text.push(`${IC.RAMP_SIZE[old.size]} stand: click to remove it`);
    return out;
  }
  const size = m.size || 'm', sz = IC.STAND[size];
  let a = m.rot, c = { x: hv.x, y: hv.y }, nose = '';
  // near a terminal or cargo shed (and not turned by hand): nose in to its nearest face
  if (m.rot === m.rot0) {
    const term = ap.parts.filter(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.w).map(q => ({ q, d: IC.partDist(ap, q, hv) })).filter(x => x.d < sz.d + 0.2).sort((x, y) => x.d - y.d)[0];
    if (term) {
      const l = IC.rectLocal(term.q, hv), q = term.q, dx = Math.abs(l.x) - q.w / 2, dy = Math.abs(l.y) - q.h / 2;
      a = dy > dx ? q.a + (l.y > 0 ? -Math.PI / 2 : Math.PI / 2) : q.a + (l.x > 0 ? Math.PI : 0);
      const e = dy > dx ? IC.rectWorld(q, U.clamp(l.x, -q.w / 2, q.w / 2), Math.sign(l.y || 1) * q.h / 2) : IC.rectWorld(q, Math.sign(l.x || 1) * q.w / 2, U.clamp(l.y, -q.h / 2, q.h / 2));
      c = { x: e.x - Math.cos(a) * (sz.d / 2 + 0.03), y: e.y - Math.sin(a) * (sz.d / 2 + 0.03) };
      nose = q.kind === 'terminal' ? 'gate' : 'cargo';
    }
  }
  // a 5 m grid along the apron
  const l = IC.rectLocal(apr, c), g = 0.05;
  const lx = nose ? l.x : Math.round(l.x / g) * g, ly = nose ? l.y : Math.round(l.y / g) * g, w = IC.rectWorld(apr, lx, ly);
  const me = { x: w.x, y: w.y, a, size };
  const R = standRect(me);
  const inside = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => { const k = IC.rectLocal(apr, IC.rectWorld(R, sx * R.w / 2, sy * R.h / 2)); return Math.abs(k.x) <= apr.w / 2 + 0.02 && Math.abs(k.y) <= apr.h / 2 + 0.02; });
  const hit = ap.parts.some(q => q.kind === 'apron' && (q.stands || []).some(s => IC.rectsOverlap(standRect(s), R, 0.01)));
  out.stand = { apron: apr, lx, ly, rot: U.angWrap(a - apr.a), size, drive: !!m.drive, zone: m.zone };
  out.ok = inside && !hit; out.why = !inside ? 'Does not fit on the apron.' : hit ? 'Overlaps another stand.' : '';
  const fitsT = IC.STAND_FITS[size].map(z => Object.keys(IC.ACTYPES).filter(k => IC.ACTYPES[k].stand === z && !IC.ACTYPES[k].vtol).map(k => IC.ACTYPES[k].short).join(', ')).filter(Boolean).join(', ');
  out.text.push(`${IC.RAMP_SIZE[size]} stand${nose === 'gate' ? ' at a gate' : nose === 'cargo' ? ' at the cargo shed' : ''}, ${m.drive ? 'drive-through' : 'nose-in (a tug pushes it back)'} · ₭0.5M · ${fitsT}`);
  if (!apr.ramp) out.text.push('The apron\'s stands become yours to place: the ones laid out automatically stay until you remove them');
  out.cost = 0.5;
  return out;
};

/* ---------- the plan for what is under the cursor ---------- */
/* m: the build mode; hv: the cursor. Returns { specs, text[], ok, why, cost, dur, snap } — the same for the ghost,
   the panel and the final click, so what the player sees is what gets built */
IC.bldPlanOf = function (S, m, hv, tol, free) {
  const ap = m.ap, t = m.part, out = { specs: [], text: [], ok: true, why: '', cost: 0, dur: 0, snap: null };
  if (!hv) return out;
  const pts = m.pts.slice();
  if (LINE_TOOLS[t]) {
    const s = snapLine(ap, m, hv, tol, free); out.snap = s;
    const last = pts[pts.length - 1];
    if (!last || U.dist(last, s) > 0.02) { if ((t === 'runway' || t === 'concourse') && pts.length === 2) pts[1] = s; else pts.push(s); }
    out.pts = pts;
    if (pts.length < 2) return out;
    if (t === 'taxi') out.specs.push({ kind: 'taxi', pts: m.fillet ? IC.bldFillet(pts, pts.map(q => q.kind && q.kind !== 'free'), 0.45) : pts, mat: m.mat, zone: m.zone });
    else if (t === 'runway') out.specs.push({ kind: 'runway', a: pts[0], b: pts[1], mat: m.mat });
    else { const c = concourseSpec(ap, pts[0], pts[1], m.size === 'l' ? 'l' : 'm'); out.specs = c.specs; out.text.push(...c.text); }
  } else if (AREA_TOOLS[t]) {
    const s = snapCorner(ap, m, hv, tol, free); out.snap = s;
    if (!pts.length) return out;
    const c2 = pts.length >= 2 && U.dist(pts[1], s) < 0.02 ? pts[1] : s;
    const r0 = { x: pts[0].x, y: pts[0].y, a: m.rot }, l = IC.rectLocal(r0, c2), c = IC.rectWorld(r0, l.x / 2, l.y / 2);
    const rc = { x: c.x, y: c.y, a: m.rot, w: Math.abs(l.x), h: Math.abs(l.y) };
    out.pts = [pts[0], c2];
    if (rc.w < 0.3 || rc.h < 0.3) { out.ok = false; out.why = 'Too small: at least 30 m each way.'; return out; }
    const kind = t === 'remote' || t === 'ramp' ? 'apron' : t;
    if (t === 'remote') out.specs = remoteSpec(ap, rc).map(q => Object.assign(q, { mat: m.mat, zone: m.zone }));
    else out.specs.push(Object.assign({ kind, mat: m.mat, zone: m.zone }, kind === 'apron' && t !== 'ramp' ? { smax: m.size || 'm' } : null, rc, t === 'ramp' ? { ramp: true, free: [] } : t === 'surface' ? { surf: m.surf || 'grass' } : null));
  } else if (t === 'stretch') {
    // the edge of an apron nearest the first click, pushed out to the cursor
    const from = pts[0] || hv, E = apronEdge(ap, from, Math.max(tol, 0.15));
    if (!E) { out.ok = false; out.why = 'Click the edge of an apron.'; return out; }
    out.snap = { kind: 'edge', x: E.p.x, y: E.p.y, what: 'apron' };
    if (!pts.length) { out.text.push('Click this edge, then how far out to stretch it'); return out; }
    const q = E.apr, l = IC.rectLocal(q, hv), along = E.ax ? l.x * E.s - q.w / 2 : l.y * E.s - q.h / 2, d = Math.round(Math.max(0, along) / 0.05) * 0.05;
    out.pts = [pts[0], hv];
    if (d < 0.3) { out.ok = false; out.why = 'Stretch it at least 30 m.'; return out; }
    const c = E.ax ? IC.rectWorld(q, E.s * (q.w / 2 + d / 2), 0) : IC.rectWorld(q, 0, E.s * (q.h / 2 + d / 2));
    out.specs.push(Object.assign({ kind: 'apron', x: c.x, y: c.y, a: q.a, w: E.ax ? d : q.w, h: E.ax ? q.h : d, mat: q.mat || m.mat, zone: q.zone || m.zone, ramp: true, free: [] }));
    out.text.push(`Stretches the apron ${Math.round(d * 100)} m (${((E.ax ? d * q.h : d * q.w)).toFixed(1)} ha): place stands on it with the Stand tool`);
  } else if (t === 'parallel') {
    const rw = pts.length ? ap.parts.find(q => q.id === m.rw) : runwayAt(ap, hv, tol);
    if (!rw) { out.ok = false; out.why = 'Click a runway.'; return out; }
    out.rw = rw;
    if (!pts.length) { out.text.push(`${rw.name}: click it, then move out to set the distance`); return out; }
    const P = parallelSpec(ap, rw, hv); out.specs = P.specs.map(q => Object.assign(q, { mat: m.mat })); out.text.push(...P.text); out.pts = [pts[0], hv];
  } else if (t === 'exits') {
    const rw = runwayAt(ap, hv, tol);
    if (!rw) { out.ok = false; out.why = 'Click a runway.'; return out; }
    out.rw = rw;
    const key = rw.id + ':' + (ap.G && ap.G.ver) + ':' + ap.parts.length;
    if (m.exitKey !== key) { m.exitKey = key; m.exitPlan = exitSpec(S, ap, rw); }
    out.specs = m.exitPlan.specs.map(q => Object.assign({}, q, { mat: m.mat })); out.text.push(...m.exitPlan.text);
    if (m.exitPlan.bad) { out.ok = false; out.why = m.exitPlan.text[0]; }
    out.pts = pts.length ? [pts[0]] : [];
  } else if (t === 'hold') {
    const rw = runwayAt(ap, hv, tol);
    if (!rw) { out.ok = false; out.why = 'Click near a runway end.'; return out; }
    out.rw = rw;
    const H = holdSpec(ap, rw, hv); out.specs = H.specs.map(q => Object.assign(q, { mat: m.mat })); out.text.push(...H.text);
    if (H.bad) { out.ok = false; out.why = H.text[0]; }
    out.pts = m.pts.length ? [m.pts[0]] : [];
  } else if (t === 'stand') {
    const P = IC.bldStandPlan(S, m, hv);
    Object.assign(out, P);
    return out;
  } else {
    // a building: one click places it, a second on the same spot builds it
    const s = snapCorner(ap, m, hv, tol * 0.3, free);
    const at = pts.length && U.dist(pts[0], s) < Math.max(tol, 0.05) ? pts[0] : s;
    const sb = !free && t !== 'ils' && IC.bldSnapBuilding(ap, t, at);
    if (sb) { out.snap = sb.snap; out.pts = [sb.snap]; out.specs.push(...sb.specs); out.text.push(sb.text); }
    else { out.snap = s; out.pts = [at]; out.specs.push({ kind: t, x: at.x, y: at.y, a: m.rot }); }
  }
  // cost, time, clearance and effect of everything in the plan
  let homes = 0, comp = 0, roads = 0, res = 0; const clrAll = [];
  for (const sp of out.specs) {
    const probe = Object.assign({}, sp);
    if (probe.kind === 'ils') continue;
    const D = IC.APART[probe.kind];
    if (!D.area && D.h && probe.kind !== 'runway' && probe.kind !== 'taxi') { probe.w = probe.w || D.w; probe.h = probe.h || D.h; }
    if (D.r) probe.r = D.r;
    const pv = IC.bldPreview(S, ap, probe);
    out.cost += pv.cost; out.dur = Math.max(out.dur, pv.dur); homes += pv.clr.blocks.length; comp += pv.clr.comp; roads += pv.clr.roads; res += pv.clr.res; clrAll.push(...pv.clr.blocks);
    (out.blocks = out.blocks || []).push(...pv.clr.blocks.map(x => x.b));
    if (!out.near && pv.near) out.near = pv.near;
    if (!IC.aptCanPlace(S, ap, probe.kind === 'taxi' ? { kind: 'taxi', pts: probe.pts } : probe)) { out.ok = false; out.why = IC.aptPlaceWhy || (probe.kind === 'taxi' || probe.kind === 'runway' ? 'Leaves the airport site, or crosses a river or lake.' : `The ${D.name.toLowerCase()} overlaps another part, stands in water or leaves the site.`); }
    if (probe.kind === 'runway' && !out.text.length) out.text.push(runwayText(S, ap, probe));
    if (probe.kind === 'apron' && t !== 'concourse') out.text.push(probe.ramp ? `Open ramp ${(probe.w * probe.h).toFixed(1)} ha: place stands of any size on it` : apronText(ap, probe));
    if (probe.kind === 'surface') out.text.push(`${IC.SURF[probe.surf].name}, ${(probe.w * probe.h).toFixed(1)} ha${IC.SURF[probe.surf].park ? `: parks about ${Math.round(IC.SURF[probe.surf].park * probe.w * probe.h)} cars outside the airfield` : ''}`);
    if (probe.kind === 'terminal' && t !== 'concourse') out.text.push(`${Math.round(D.pax * probe.w * probe.h).toLocaleString('en-US')} passengers an hour`);
    if (probe.kind === 'taxi' && t === 'taxi') out.text.push(taxiText(S, ap, out, probe));
    if (probe.kind === 'fuel') { const near = ap.parts.filter(q => q.kind === 'fuel' && U.dist(q, probe) < 1.4).length; if (near) out.text.push(`${near} tank${near > 1 ? 's' : ''} within 140 m: one fire takes them all`); }
    if (probe.kind === 'fire') { const far = ap.parts.filter(q => q.kind === 'runway').map(rw => Math.max(...[0, 0.5, 1].map(f => 60 + U.dist(probe, IC.rwAt(rw, f)) / 0.25))); if (far.length) out.text.push(`trucks reach every runway in ${U.dur(Math.max(...far))}${Math.max(...far) > 180 ? ' (over the three-minute standard)' : ''}`); }
  }
  if (IC.PAVED[out.specs[0] && out.specs[0].kind] || t === 'concourse') out.text.push(IC.paveFits(m.mat || 'conc'));
  if (homes) out.text.push(`Clears ${IC.bldClearText({ blocks: clrAll, res })}: ${U.money(comp)} compensation, and the town will protest`);
  if (roads) out.text.push(`${roads > 1 ? roads + ' roads run' : 'a road runs'} under it in a tunnel`);
  if (out.near) out.text.push(`Closes ${out.near.name} while paving next to it (or set night work in the panel)`);
  const len = LINE_TOOLS[t] && out.pts && out.pts.length > 1 ? out.pts.reduce((a, q, i) => a + (i ? U.dist(out.pts[i - 1], q) : 0), 0) : 0;
  if (out.specs.length) out.text.unshift(`${len ? U.km(len) + ' · ' : ''}${U.money(out.cost)} · about ${U.dur(out.dur)} of work`);
  if (out.ok && S.budget < out.cost * 0.1) { out.ok = false; out.why = `Not enough money to start: ${U.money(out.cost * 0.1)} needed.`; }
  const lock = out.specs.map(sp => IC.aptLockWhy(S, sp.kind, sp.mat || m.mat)).find(Boolean);
  if (lock) { out.ok = false; out.why = lock; }
  return out;
};
const runwayNoise = (S, p) => { const c = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }; return IC.noiseOver(S, c.x, c.y, Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x), U.dist(p.a, p.b)); };
function runwayText(S, ap, p) {
  const len = U.dist(p.a, p.b), t = Object.entries(IC.ACTYPES).filter(([, T]) => !T.mil && T.rwy <= len).map(([, T]) => T.short);
  const a = Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x), off = Math.abs(U.angWrap(((a - IC.PREVAIL) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2)) * 180 / Math.PI, w = Math.round(Math.min(off, 180 - off));
  const rel = ap.parts.filter(q => q.kind === 'runway').map(q => IC.rwDependent(q, p)).filter(Boolean);
  const noise = Object.entries(runwayNoise(S, p));
  return `Runway ${U.km(len)}: ${t.length ? 'fits ' + t.join(', ') : 'too short for airliners'} · ${w <= 15 ? 'into the prevailing wind' : w + '° off the prevailing wind'}${rel.length ? ` · ${rel.includes('cross') ? 'crosses' : 'closer than 760 m to'} another runway: they share one clearance` : ''}${noise.length ? ` · noise over ${noise.map(([k, n]) => `${n} city blocks of ${k}`).join(', ')}` : ''}`;
}
function apronText(ap, p) {
  const dep = p.h * 0.64, sz = IC.apronStandSize(p);
  const alt = p.w * 0.64 >= IC.STAND.s.d && p.w > p.h * 1.5 ? '' : ' (depth is measured across the rotation: press R to turn it)';
  if (!sz) return `Too shallow for stands: ${Math.round(IC.STAND.s.d / 0.64 * 100)} m deep at least${alt}`;
  const n = Math.floor(p.w / IC.STAND[sz].w);
  const term = ap.parts.some(q => q.kind === 'terminal' && IC.partDist(ap, q, p) < 0.5);
  const deeper = p.smax && IC.apronStandSize(Object.assign({}, p, { smax: 'l' })) !== sz ? ` · deep enough for bigger stands: pick them under Stands` : '';
  return `Adds ${n} ${IC.STAND[sz].name} stands${term ? ' at gates' : ' (remote: passengers go by bus)'}${deeper || (sz !== 'l' && (!p.smax || p.smax === 'l') ? ` · ${Math.round(IC.STAND[sz === 's' ? 'm' : 'l'].d / 0.64 * 100)} m deep for ${sz === 's' ? 'jets' : 'wide-bodies'}` : '')}`;
}
/* what a taxiway does: joins, and the runway time saved by a new exit */
function taxiText(S, ap, out, p) {
  const ends = [out.pts[0], out.pts[out.pts.length - 1]];
  const on = ends.find(e => e.kind === 'rwy');
  if (!on) return ends.every(e => e.kind !== 'free') ? 'joins the network at both ends' : ends.some(e => e.kind !== 'free') ? 'one end joins the network' : 'not joined to anything yet';
  const rw = ap.parts.find(q => q.id === on.part); if (!rw || !rw.built) return 'onto a runway under construction';
  const G = IC.aptGraph(ap), L = IC.rwLen(rw), s = on.t * L, list = G.rwn.get(rw.id) || [];
  if (list.some(n => n.exit && Math.abs(n.s - s) < 0.2)) return `joins ${rw.name} where an exit already is`;
  const T = IC.ACTYPES[(ap.st && ap.st.refType) || 'narrow'];
  let best = '';
  for (const dir of [1, -1]) {
    const before = IC.rwOcc(S, ap, rw, dir, T).land;
    G.rwn.set(rw.id, list.concat([{ id: '_x', t: on.t, s, exit: true, entry: true }]));
    const after = IC.rwOcc(S, ap, rw, dir, T).land;
    G.rwn.set(rw.id, list);
    if (after < before - 5) { const txt = `exit at ${U.km(dir > 0 ? s : L - s)} for landings on ${IC.rwEnd(rw, dir)} cuts runway time ${before >= 1e8 ? 'from never to ' + U.dur(after) : 'by ' + U.dur(before - after)}`; if (!best || after < before) best = txt; }
  }
  return best || (s < 0.6 || s > L - 0.6 ? `joins ${rw.name} at its end` : `joins ${rw.name} ${U.km(Math.min(s, L - s))} from its end`);
}

/* ---------- controls ---------- */
/* build mode for a tool, with the player's last choices of pavement, stand size and zone */
IC.bldMode = function (S, ap, part) {
  const P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true };
  return { kind: 'build', ap, part, pts: [], rot: ap.rwyA || 0, rot0: ap.rwyA || 0, mat: P.mat, size: P.size, zone: P.zone, fillet: P.fillet, drive: !!P.drive, surf: P.surf || 'grass' };
};
/* one click in build mode. btn 0 places, 2 takes back. Returns what happened: 'point', 'built', 'undo', 'exit',
   'err' (with m.err saying why) */
IC.buildInput = function (S, m, p, btn, z, free) {
  const ap = m.ap, tol = Math.max(0.12, 8 / (z || 4));
  m.err = '';
  if (btn === 2) {
    if (m.pts.length) { m.pts.pop(); if (!m.pts.length) m.rw = null; return 'undo'; }
    return 'exit';
  }
  const plan = IC.bldPlanOf(S, m, p, tol, free);
  if (m.part === 'stand') {
    if (!plan.ok) { m.err = plan.why; return 'err'; }
    return IC.bldAddStand(S, ap, plan.stand) ? 'built' : (m.err = 'Not enough money.', 'err');
  }
  if (m.part === 'exits' || m.part === 'hold') {
    if (!plan.rw) { m.err = plan.why; return 'err'; }
    if (m.pts.length && m.rw === plan.rw.id) return finish(S, m, plan);
    m.pts = [{ x: p.x, y: p.y }]; m.rw = plan.rw.id; return 'point';
  }
  if (m.part === 'parallel') {
    if (!m.pts.length) { if (!plan.rw) { m.err = plan.why; return 'err'; } m.rw = plan.rw.id; m.pts = [{ x: p.x, y: p.y }]; return 'point'; }
    if (m.pts.length === 2 && U.dist(m.pts[1], p) < tol) return finish(S, m, plan);
    m.pts[1] = { x: p.x, y: p.y }; return 'point';
  }
  const s = plan.snap || p, last = m.pts[m.pts.length - 1];
  const again = last && U.dist(last, s) < Math.max(tol * 0.8, 0.05);
  const need = LINE_TOOLS[m.part] || AREA_TOOLS[m.part] || m.part === 'stretch' ? 2 : 1;
  if (m.part === 'stretch' && m.pts.length) { if (m.pts.length === 2 && U.dist(m.pts[1], p) < Math.max(tol * 0.8, 0.05)) return finish(S, m, plan); m.pts[1] = { x: p.x, y: p.y }; return 'point'; }
  if (m.part === 'stretch' && !plan.snap) { m.err = plan.why; return 'err'; }
  if (again && m.pts.length >= need) return finish(S, m, plan);
  if (again) return 'point';
  if ((m.part === 'runway' || m.part === 'concourse' || AREA_TOOLS[m.part]) && m.pts.length === 2) m.pts[1] = s;
  else if (need === 1) m.pts = [s];
  else m.pts.push(s);
  return 'point';
};
/* Enter: build what is drawn */
IC.buildFinish = function (S, m, z) {
  const last = m.pts[m.pts.length - 1]; if (!last) return 'err';
  const plan = IC.bldPlanOf(S, m, m.part === 'parallel' || m.part === 'stretch' ? m.pts[1] || last : last, Math.max(0.12, 8 / (z || 4)));
  return finish(S, m, plan);
};
function finish(S, m, plan) {
  const ap = m.ap;
  if (!plan.specs.length) { m.err = plan.why || 'Nothing to build yet.'; return 'err'; }
  if (!plan.ok) { m.err = plan.why; IC.log(S, 'warn', 'BUILD', plan.why); return 'err'; }
  const made = IC.bldPlanSpecs(S, ap, plan.specs);
  if (!made.length) { m.err = 'Could not plan it.'; return 'err'; }
  m.pts = []; m.rw = null; m.exitKey = null;
  const W = made.map(p => ap.works.find(w => w.part === p)).filter(Boolean), cost = W.reduce((a, w) => a + (w.cost || 0), 0), dur = Math.max(0, ...W.map(w => w.dur || 0));
  const name = made.length > 1 ? made.map(p => IC.APART[p.kind].name.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ') : made[0].kind === 'runway' ? made[0].name || 'Runway' : IC.APART[made[0].kind].name;
  const busy = ap.works.filter(w => w.stages && !W.includes(w)), crews = ap.crews || 1;
  m.done = `${name[0].toUpperCase() + name.slice(1)} planned: ${U.money(cost)}, about ${U.dur(dur)} of work. ` + (busy.length >= crews
    ? `Queued: ${crews === 1 ? 'the crew is' : `all ${crews} crews are`} busy on ${busy[0].part && busy[0].part.kind === 'runway' ? busy[0].part.name : busy[0].label.replace(/^Build /, '').toLowerCase()}${busy.length > 1 ? ` and ${busy.length - 1} more` : ''}. More crews: the Works tab.`
    : 'Work starts now.');
  return 'built';
}
/* plan several parts as one step (a concourse, a remote apron): areas first, so taxiways snap to them */
IC.bldPlanSpecs = function (S, ap, specs) {
  const made = [];
  const order = specs.slice().sort((a, b) => (a.kind === 'taxi') - (b.kind === 'taxi'));
  for (const sp of order) {
    let p = null;
    if (sp.kind === 'taxi') p = IC.aptPlanTaxi(S, ap, sp.pts, 0.1, { mat: sp.mat, zone: sp.zone, exact: sp.lane });
    else if (sp.kind === 'runway') p = IC.aptPlanRunway(S, ap, sp.a, sp.b, null, { mat: sp.mat });
    else { p = IC.aptPlanPart(S, ap, sp.kind, sp.x, sp.y, sp.a, sp.w, sp.h, { mat: sp.mat, zone: sp.zone, ramp: sp.ramp, surf: sp.surf, smax: sp.smax }); if (p && sp.link) p.link = sp.link; }
    if (p) made.push(p);
  }
  if (made.length > 1) { const ids = made.map(p => p.id); ap.undo.splice(ap.undo.length - made.length, made.length, ids); }
  return made;
};
/* stands by hand: an apron laid out automatically switches over, keeping its stands where they are */
IC.bldManualStands = function (ap, apr) {
  if (apr.ramp) return;
  IC.aptGraph(ap);
  apr.free = (apr.stands || []).map((s, i) => { const l = IC.rectLocal(apr, s); return { k: i, lx: l.x, ly: l.y, rot: U.angWrap(s.a - apr.a), size: s.size, zone: null }; });
  apr.sN = apr.free.length; apr.ramp = true; ap.dirty = true;
};
/* back to the automatic layout, when no aircraft stands on it */
IC.bldAutoStands = function (S, ap, apr) {
  if (!apr.ramp || (apr.stands || []).some(s => s.occ)) return false;
  apr.ramp = false; apr.free = null; apr.sN = 0; ap.dirty = true; IC.aptStats(S, ap);
  return true;
};
/* a stand placed on an apron, or removed */
IC.bldAddStand = function (S, ap, o) {
  const apr = o.apron || o.ramp;
  if (o.remove) {
    if (o.remove.occ) return false;
    IC.bldManualStands(ap, apr);
    const k = o.remove.id.slice(apr.id.length + 1);
    apr.free = apr.free.filter((f, i) => String(f.k != null ? f.k : i) !== k);
    ap.dirty = true; IC.aptStats(S, ap);
    return true;
  }
  if (S.budget < 0.5) return false;
  S.budget -= 0.5;
  IC.bldManualStands(ap, apr);
  apr.free = apr.free || [];
  const k = apr.sN = Math.max(apr.sN || 0, apr.free.length);
  apr.sN++;
  apr.free.push({ k, lx: o.lx, ly: o.ly, rot: o.rot || 0, size: o.size, zone: o.zone || null, drive: !!o.drive });
  ap.dirty = true; IC.aptStats(S, ap);
  (ap.undo = ap.undo || []).push({ stand: apr.id, k });
  return true;
};
/* undo the last placement: planned work that has not started is refunded in full */
IC.bldUndo = function (S, ap) {
  const L = ap.undo || [];
  while (L.length) {
    const top = L.pop(), ids = Array.isArray(top) ? top : [top];
    if (top && top.stand) { const r = ap.parts.find(p => p.id === top.stand), i = r && r.free ? r.free.findIndex(f => f.k === top.k) : -1; if (i >= 0 && !(r.stands || []).some(s => s.id === r.id + 's' + top.k && s.occ)) { r.free.splice(i, 1); S.budget += 0.5; ap.dirty = true; IC.aptStats(S, ap); return 'stand'; } continue; }
    const parts = ids.map(id => ap.parts.find(p => p.id === id)).filter(p => p && !p.built);
    if (!parts.length) continue;
    let back = 0;
    for (const p of parts) { const w = ap.works.find(x => x.part === p); if (w && w.si === 0 && !(w.stages[0].k === 'demo' && w.t > 0)) back += w.spent || 0; IC.aptRemove(S, ap, p.id); }
    S.budget += back;
    IC.log(S, 'info', 'BUILD', `${ap.name}: undone${back ? `, ${U.money(back)} refunded` : ''}.`);
    return 'part';
  }
  return '';
};
/* move or turn a planned part before its earthworks start */
IC.bldCanMove = (ap, p) => { if (p.built || p.kind === 'taxi' || p.kind === 'runway' || p.kind === 'ils') return false; const w = ap.works.find(x => x.part === p); return !w || w.stages[w.si].k === 'survey' || (w.si === 0 && w.t === 0); };
IC.bldMove = function (S, ap, p, x, y, a) {
  if (!IC.bldCanMove(ap, p)) return false;
  const was = { x: p.x, y: p.y, a: p.a };
  ap.parts = ap.parts.filter(q => q !== p);
  const probe = Object.assign({}, p, { x: x != null ? x : p.x, y: y != null ? y : p.y, a: a != null ? a : p.a });
  const ok = IC.aptCanPlace(S, ap, probe);
  ap.parts.push(p);
  if (!ok) return false;
  p.x = probe.x; p.y = probe.y; p.a = probe.a; p.door = null;
  if (p.kind === 'apron' || p.kind === 'alert') IC.resolveNodes(ap);
  ap.dirty = true; IC.aptExtent(ap);
  const w = ap.works.find(q => q.part === p);
  if (w) { const pv = IC.bldPreview(S, ap, p); w.near = pv.near ? pv.near.id : null; w.clrBox = pv.clr.box; if (w.si === 0 && w.stages[0].k !== 'demo' && pv.clr.blocks.length) { IC.log(S, 'warn', 'BUILD', 'Moved over homes: remove and plan it again to clear them.'); } }
  return !!was;
};

/* choosing a pavement: a locked one cannot be chosen until its research is done */
IC.bldPick = function (S, mat) {
  const lock = IC.aptLockWhy(S, 'runway', mat);
  if (lock) { IC.log(S, 'warn', 'BUILD', `${IC.PAVE[mat].name}: ${lock}`); return false; }
  const P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true };
  P.mat = mat; if (S.mode2 && S.mode2.kind === 'build') S.mode2.mat = mat;
  return true;
};
/* the airport panel's airport-life buttons (data-act="apl", data-op=...) */
IC.aplAct = function (S, ap, d) {
  const sel = S.sel && S.sel.kind === 'apart' ? S.sel.ref : null;
  if (d.op === 'stands' && sel && sel.kind === 'apron') {
    if (d.v === 'hand') { IC.bldManualStands(ap, sel); IC.aptStats(S, ap); S.mode2 = IC.bldMode(S, ap, 'stand'); }
    else if (!IC.bldAutoStands(S, ap, sel)) IC.log(S, 'warn', 'BUILD', `${ap.name}: aircraft are parked on that apron; the stands can be laid out again once it is empty.`, sel);
  }
  if (IC.aplActMore) IC.aplActMore(S, ap, d, sel);
};

/* ---------- founding an airport ---------- */
/* first click picks the site, the cursor then turns the runway, a second click founds it */
IC.foundInput = function (S, m, p, btn) {
  m.err = '';
  if (btn === 2) { if (m.site) { m.site = null; return 'undo'; } return 'exit'; }
  if (!m.site) { const why = IC.foundCheck(S, p.x, p.y); if (why) { m.err = why; return 'err'; } m.site = { x: p.x, y: p.y }; return 'point'; }
  const a = IC.foundAngle(m.site, p);
  const ap = IC.foundAirport(S, m.site.x, m.site.y, a);
  if (!ap) { m.err = 'Cannot found it here.'; return 'err'; }
  m.site = null; m.ap = ap;
  return 'built';
};
/* the runway heading from the site towards the cursor, in 10° steps */
IC.foundAngle = (site, p) => { const a = Math.atan2(p.y - site.y, p.x - site.x), st = Math.PI / 18; return U.dist(site, p) < 1 ? IC.PREVAIL : Math.round(a / st) * st; };

/* for tests without a browser: a click at a world position in the current mode (main.js replaces this) */
IC.clickWorld = IC.clickWorld || function (p, btn, shift) {
  const S = IC.S, m = S && S.mode2; if (!m) return '';
  S.hover = p;
  const r = m.kind === 'build' ? IC.buildInput(S, m, p, btn || 0, IC.cam ? IC.cam.z : 20, shift) : m.kind === 'found' ? IC.foundInput(S, m, p, btn || 0) : '';
  if (r === 'exit') S.mode2 = null;
  return r;
};

})(window.IC);
