/* Iron Canopy — the player's own layouts (wave 13). Box part of an airport with the Save layout tool and it is kept as
   a layout: the parts as they are (runways, taxiways with their nodes, aprons with their stands, buildings), in the
   box's own frame. Under Blueprints, My layouts places one at any of our airports like a blueprint: turned with R,
   mirrored with F, checked, priced and planned as works (IC.bldBlueprint), and undone as one step. Layouts are kept
   in the game (S.layouts) and, in a browser, in its storage too, so they come along to the next game.
   Headless. */
(function (IC) {
'use strict';
const U = IC.U;
IC.LAYOUT_MAX = 24;
// (what a part carries that belongs to the airport it stands at, not to its shape: left behind when it is saved)
const DROP = new Set(['hp', 'max', 'built', 'prog', 'stands', 'stage', 'stock', 'occ', 'shut', 'wear', 'craters', 'cut', 'link', 'inside', 'real', 'custom', 'name', 'ends', 'dead', 'bridge', 'gains']);
const clone = o => JSON.parse(JSON.stringify(o, (k, v) => (k && (k[0] === '_' || DROP.has(k)) ? undefined : v)));

/* the point a part is judged by when a box is drawn round it */
function anchor(ap, p) {
  if (p.kind === 'runway') return IC.rwAt(p, 0.5);
  if (p.nodes) { const ns = p.nodes.map(id => ap.nodes[id]).filter(Boolean); return ns.length ? { x: ns.reduce((a, q) => a + q.x, 0) / ns.length, y: ns.reduce((a, q) => a + q.y, 0) / ns.length } : null; }
  if (p.pts && p.pts.length) return { x: p.pts.reduce((a, q) => a + q.x, 0) / p.pts.length, y: p.pts.reduce((a, q) => a + q.y, 0) / p.pts.length };
  return p.x != null ? p : null;
}
/* the parts inside a box (two corners, in the frame turned by rot); a landing system comes with its runway */
IC.layoutPick = function (ap, a, b, rot) {
  const box = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a: rot || 0 }, la = IC.rectLocal(box, a), lb = IC.rectLocal(box, b);
  box.w = Math.abs(lb.x - la.x); box.h = Math.abs(lb.y - la.y);
  const inside = q => { const l = IC.rectLocal(box, q); return Math.abs(l.x) <= box.w / 2 && Math.abs(l.y) <= box.h / 2; };
  const parts = ap.parts.filter(p => p.kind !== 'ils' && p.hp !== 0 && (() => { const c = anchor(ap, p); return c && inside(c); })());
  const ids = new Set(parts.map(p => p.id));
  for (const p of ap.parts) if (p.kind === 'ils' && ids.has(p.rw)) parts.push(p);
  return { box, parts };
};
/* what a layout holds, in words: "a terminal, 2 aprons with 12 stands, 5 taxiways" */
IC.layoutWords = function (L) {
  const n = {}; for (const p of L.parts) n[p.kind] = (n[p.kind] || 0) + 1;
  const say = (k, one, many) => n[k] ? (n[k] === 1 ? one : `${n[k]} ${many}`) : '';
  return [say('runway', 'a runway', 'runways'), say('terminal', 'a terminal', 'terminals'), say('apron', 'an apron', 'aprons') + (L.stands ? ` with ${L.stands} stands` : ''),
    say('taxi', 'a taxiway', 'taxiways'), say('hangar', 'a hangar', 'hangars'), say('cargo', 'a cargo shed', 'cargo sheds')].filter(Boolean).join(', ') || `${L.parts.length} parts`;
};
/* keep what is in the box as a layout: its parts in the box's frame, the box's centre at the origin */
IC.layoutSave = function (S, ap, a, b, rot, name) {
  const { box, parts } = IC.layoutPick(ap, a, b, rot);
  if (!parts.length) return null;
  const to = q => { const l = IC.rectLocal(box, q); return { x: +l.x.toFixed(4), y: +l.y.toFixed(4) }; };
  const nodes = {}, out = [];
  for (const p of parts) {
    const c = clone(p);
    c.oid = p.id; delete c.id;
    if (p.kind === 'runway') { c.a = to(p.a); c.b = to(p.b); }
    if (p.nodes) for (const id of p.nodes) if (ap.nodes[id] && !nodes[id]) { const q = to(ap.nodes[id]); nodes[id] = [q.x, q.y]; }
    if (p.pts) c.pts = p.pts.map(to);
    if (p.x != null && p.kind !== 'runway') { const q = to(p); c.x = q.x; c.y = q.y; c.a = U.angWrap((p.a || 0) - box.a); }
    if (p.door) c.door = to(p.door);
    out.push(c);
  }
  const stands = parts.reduce((s, p) => s + (p.kind === 'apron' ? (p.stands || []).length : 0), 0);
  S.layouts = S.layouts || [];
  const L = { key: 'lay' + (S.layoutN = (S.layoutN || 0) + 1) + '-' + Math.round(S.time), snap: true, kit: true, parts: out, nodes, stands, w: box.w, h: box.h, from: ap.name, t: S.time };
  L.name = name || `Layout ${S.layoutN}`;
  L.cost = parts.reduce((a, p) => a + IC.partCost(ap, p), 0);
  S.layouts.unshift(L);
  if (S.layouts.length > IC.LAYOUT_MAX) S.layouts.length = IC.LAYOUT_MAX;
  IC.layoutStore(S);
  IC.log(S, 'info', 'BUILD', `Saved ${L.name}: ${IC.layoutWords(L)} from ${ap.name}. Blueprints → My layouts places it at any of our airports.`, ap);
  IC.emit(S, 'bld', { act: 'saved', v: L.key });
  return L;
};
IC.layoutDelete = function (S, key) {
  S.layouts = (S.layouts || []).filter(L => L.key !== key);
  const st = store(); if (st) try { st.setItem(KEY, JSON.stringify((JSON.parse(st.getItem(KEY) || '[]') || []).filter(L => L.key !== key))); } catch (e) { /* storage full or blocked */ }
};
IC.layoutGet = (S, key) => (S.layouts || []).find(L => L.key === key) || null;

/* ---------- kept between games, in the browser ---------- */
const KEY = 'ironCanopy.layouts';
const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
IC.layoutStore = function (S) {
  const st = store(); if (!st) return;
  try { st.setItem(KEY, JSON.stringify((S.layouts || []).slice(0, IC.LAYOUT_MAX))); } catch (e) { /* storage full or blocked: they stay in this game */ }
};
/* a new game takes the layouts saved in the last ones */
IC.layoutLoad = function (S) {
  const st = store(); if (!st) return;
  let L = []; try { L = JSON.parse(st.getItem(KEY) || '[]') || []; } catch (e) { return; }
  const have = new Set((S.layouts || []).map(x => x.key));
  S.layouts = (S.layouts || []).concat(L.filter(x => x && x.snap && x.parts && !have.has(x.key))).slice(0, IC.LAYOUT_MAX);
};

/* ---------- placing one ---------- */
/* a saved layout built into a scratch airport at x, y, turned by rot, mirrored across its own long axis when mirror
   is set (airports-real.js's scratch() asks for this when the layout is one of ours) */
IC.layoutBuild = function (t, L, o) {
  IC.initAirport(t); IC.landInit(t).jn = [];
  const rot = o.rot || 0, mir = L.mirror || o.mirror ? -1 : 1, c = Math.cos(rot), s = Math.sin(rot);
  const X = q => { const y = q.y * mir; return { x: o.x + q.x * c - y * s, y: o.y + q.x * s + y * c }; };
  const nid = {}, pid = {};
  for (const [id, q] of Object.entries(L.nodes || {})) { const w = X({ x: q[0], y: q[1] }); nid[id] = IC.aptNode(t, w.x, w.y); }
  // (runways first: the landing systems name theirs)
  const order = L.parts.filter(p => p.kind === 'runway').concat(L.parts.filter(p => p.kind !== 'runway' && p.kind !== 'ils'), L.parts.filter(p => p.kind === 'ils'));
  for (const p0 of order) {
    const p = JSON.parse(JSON.stringify(p0)); delete p.oid;
    if (p.kind === 'runway') { p.a = X(p0.a); p.b = X(p0.b); }
    if (p.nodes) p.nodes = p0.nodes.map(id => nid[id]).filter(Boolean);
    if (p.pts) p.pts = p0.pts.map(X);
    if (p.door) p.door = X(p0.door);
    if (p.x != null && p.kind !== 'runway') {
      Object.assign(p, X(p0)); p.a = rot + mir * (p0.a || 0);
      if (mir < 0) {
        if (p.poly) p.poly = p.poly.map(v => [v[0], -v[1]]);
        if (p.free) p.free = p.free.map(f => Object.assign(f, { ly: -f.ly, rot: -f.rot }));
        if (p.arc) Object.assign(p.arc, { y: -p.arc.y, a0: -p0.arc.a1, a1: -p0.arc.a0 });
        if (p.doorSide) p.doorSide = -p.doorSide;
      }
    }
    if (p.free) for (const f of p.free) f.via = f.via ? nid[f.via] || null : null;
    if (p.kind === 'ils') { p.rw = pid[p0.rw]; if (!p.rw) continue; }
    if (p.joins) p.joins = p.joins.map(i => pid[i] || i);
    if (p.stops) p.stops = p.stops.map(i => pid[i] || i);
    const made = IC.aptAddPart(t, p, true);
    pid[p0.oid] = made.id;
  }
  IC.resolveNodes(t);
  t.dirty = true;
  t.rwyA = rot;
  IC.aptExtent(t);
  return t;
};

})(window.IC);
