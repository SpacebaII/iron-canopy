/* The cutscenes' action panels (brief 70), shot in the game's 3D view: one scene a panel, named cut-<art>, run by
   tools/view3d-shots.js (node tools/view3d-shots.js cut-night-2 --out cut, or `cut` for all of them). Each saves
   shots/<dir>/3d-cut-<art>.jpg, the picture alone (no labels, no panel); tools/comic-ink.py then inks it into
   iron-canopy/art/cut/<art>.jpg. The shots are the `shot` lines of IC.CUTSCENES with src '3d'. */
const CUT_LIB = `
async function cutStill(V, name, keep) {
  V.labels = false; if (!keep) V.trails = false;
  for (const m of V.movers || []) if (m.label) m.label.hidden = true;
  const pn = V.$ && V.$('panel'); if (pn) pn.style.display = 'none';
  window.requestAnimationFrame = () => 0;
  let now = performance.now(); for (let i = 0; i < 12; i++) IC.replayStep(V, now += 33);
  await __still(name, grab(V, 1600, 900).toDataURL('image/jpeg', 0.95).slice(23));
}
// the recorder starts with the first step: the live view needs it
async function liveHere(S, x, y) { if (!S.rec) steps(S, 2); return liveAt(S, x, y); }
const rangeGame = async (seed, hour, w) => {
  Math.random = seeded(seed); await IC.begin('range'); const S = IC.S; S.paused = true;
  IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600; if (w) wx(S, w);
  return S;
};
const runwayOf = ap => ap.parts.filter(p => p.kind === 'runway' && p.built).sort((p, q) => U.dist(q.a, q.b) - U.dist(p.a, p.b))[0];
const partOf = (ap, k) => ap.parts.find(p => p.kind === k && p.built);
async function landing(S, name, cam, K) {
  const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.t > 25 && (m.type === 'narrow' || m.type === 'wide' || m.type === 'prop')));
  if (!m) throw new Error('no arrival on final');
  const L = await live(S, m, cam, 2500); L.camK = K; await wait(1500); await cutStill(L, name);
}
async function overAirport(S, x, y, yaw, pitch, dist, name) {
  const L = await liveHere(S, x, y); orbitAt(L, x, y, yaw, pitch, dist); await wait(2500); await cutStill(L, name);
}
async function boom(S, x, y, n, dmg, name, yaw, pitch, dist) {
  const L = await liveHere(S, x, y); orbitAt(L, x, y, yaw, pitch, dist);
  for (let i = 0; i < n; i++) IC.detonate(S, x + U.rand(-0.4, 0.4), y + U.rand(-0.3, 0.3), dmg, null);
  S.paused = false; S.speed = 1; await wait(+(boom.ms || 1800)); S.paused = true; await wait(600);
  await cutStill(L, name);
}
/* enemy weapons sent from across the border at a place, as the sandbox sends them (IC.sendThreat) */
function fire(S, type, n, aim, km, alt) {
  const e = S.esites.slice().sort((p, q) => U.dist(p, aim) - U.dist(q, aim))[0], a = Math.atan2(e.y - aim.y, e.x - aim.x), d = (km || 150) * 10;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (i - n / 2) * 10, from = { x: aim.x + Math.cos(a) * d - Math.sin(a) * o, y: aim.y + Math.sin(a) * d + Math.cos(a) * o };
    const op = fire.op || (fire.op = { id: 'cut', type: 'range', label: 'cutscene', launched: 0, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time });
    const t = IC.sendThreat(S, type, from, { x: aim.x + U.rand(-12, 12), y: aim.y + U.rand(-12, 12) }, alt == null ? null : alt, op); if (t) out.push(t);
  }
  return out;
}
const lrsam = S => S.units.find(u => u.type === 'lrsam');
const townNear = S => IC.cities(S).filter(c => c.owner === 'us' && !c.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
`;

const SCENES = {
  'cut-first-1': `const S = await game('sandbox', 6.5); wx(S, 'scattered'); steps(S, 300); const ap = S.byId.i0, t = partOf(ap, 'terminal');
    await overAirport(S, t.x, t.y, 2.3, 0.22, 3.2, 'cut-first-1');`,
  'cut-first-3': `const S = await game('sandbox', 7.0); wx(S, 'clear'); await landing(S, 'cut-first-3', 'side', 0.55);`,
  'cut-coll-1': `const S = await game('sandbox', 14); wx(S, 'overcast');
    const t = steps(S, 3600, S => S.threats.find(t => t.tail && t.alt > 1.5 && t.alt < 5 && !t.dead));
    if (!t) throw new Error('no airliner climbing'); const L = await live(S, t, 'side', 2500); L.camK = 0.6; await wait(1200); await cutStill(L, 'cut-coll-1');`,
  'cut-coll-2': `const S = await game('sandbox', 14); wx(S, 'overcast'); const [t] = fire(S, 'owa', 1, S.byId.i0, 70, 1.5);
    if (!t) throw new Error('no drone'); steps(S, 40);
    const L = await live(S, t, 'chase', 2500); L.camK = 0.8; await wait(1200); await cutStill(L, 'cut-coll-2');`,
  'cut-coll-5': `const S = await game('sandbox', 17.6); wx(S, 'rain');
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.kind === 'arr' && m.phase === 'rollout' && m.type !== 'light'));
    if (!m) throw new Error('no landing roll'); const ap = IC.bases(S).find(b => (b.moves || []).includes(m)) || S.byId.i0;
    IC.fireRun(S, ap, m, 'crash'); m.stop = 1e9; steps(S, 75);
    const L = await live(S, m, 'side', 2000); L.camK = 1.6; await wait(1200); await cutStill(L, 'cut-coll-5');`,
  'cut-shadow-1': `const S = await game('sandbox', 11); wx(S, 'scattered');
    const t = steps(S, 3600, S => S.threats.find(t => t.tail && t.alt > 8 && !t.dead)); if (!t) throw new Error('no airliner high up');
    const b = S.esites.find(e => e.kind === 'airbase');
    for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'ftr', t.x - 15 - i * 8, t.y + 6, { home: b, mission: 'shadow', shadow: t, route: [{ x: t.x, y: t.y }], gray: true, noFire: true, alt: t.alt });
    steps(S, 90); const f = S.threats.find(x => x.type === 'ftr' && !x.dead); console.log('shadow fighter', f ? U.dist(f, t).toFixed(1) : 'none');
    const L = await live(S, f || t, 'chase', 2500); L.camK = 2.2; await wait(1200); await cutStill(L, 'cut-shadow-1');`,
  'cut-def-1': `const S = await game('sandbox', 23.1); wx(S, 'clear');
    const t = steps(S, 3 * 3600, S => S.threats.find(t => t.tail && t.alt > 0.2 && t.alt < 1.2 && !t.dead && t.tail.type !== 'light'));
    if (!t) throw new Error('nothing low at night'); const L = await live(S, t, 'side', 1500); L.camK = 0.6; await wait(1200); await cutStill(L, 'cut-def-1');`,
  'cut-def-3': `const S = await game('sandbox', 22.6); wx(S, 'clear'); steps(S, 300); const r = runwayOf(S.byId.i0), a = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x);
    await overAirport(S, r.a.x, r.a.y, -a + Math.PI / 2 + Math.PI, 0.05, 1.6, 'cut-def-3');`,
  'cut-def-3b': `const S = await game('sandbox', 22.9); wx(S, 'scattered'); steps(S, 300); const r = runwayOf(S.byId.i0), a = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x);
    await overAirport(S, r.b.x, r.b.y, -a + Math.PI / 2, 0.12, 2.6, 'cut-def-3b');`,
  'cut-blood-1': `const S = await game('sandbox', 18.9); wx(S, 'scattered');
    const t = steps(S, 3600, S => S.threats.find(t => t.tail && t.alt > 9 && !t.dead));
    if (!t) throw new Error('no airliner high up'); const L = await live(S, t, 'chase', 2500); L.camK = 1.7; await wait(1200); await cutStill(L, 'cut-blood-1');`,
  'cut-blood-2': `const S = await game('sandbox', 18.7); wx(S, 'scattered'); const u = lrsam(S); fire(S, 'str', 1, u, 140, 6);
    let tr = null; steps(S, 1200, S => (tr = S.rec.tracks.find(t => t.kind === 'missile')) && S.time > IC.recFirstT(tr) + 8);
    if (!tr) throw new Error('no missile'); const t0 = IC.recFirstT(tr);
    const V = await replay({ follow: tr.ref, x: IC.recGet(tr, 0, 1), y: IC.recGet(tr, 0, 2), t: t0 - 1, r: 150, cam: 'chase' }, t0 + 3.5);
    V.playing = false; V.camK = 2.4; await wait(1500); await cutStill(V, 'cut-blood-2', true);`,
  'cut-blood-1b': `const S = await game('sandbox', 18.6); wx(S, 'scattered'); const T = townNear(S); const L0 = fire(S, 'lacm', 3, T, 90);
    steps(S, 80); const t = L0.find(t => !t.dead) ; if (!t) throw new Error('no cruise missile');
    const L = await live(S, t, 'chase', 2500); L.camK = 0.9; await wait(1200); await cutStill(L, 'cut-blood-1b');`,
  'cut-blood-2b': `const S = await game('sandbox', 18.8); wx(S, 'scattered'); const b = IC.mainBase(S), h = partOf(b, 'hangar') || partOf(b, 'has') || b;
    await boom(S, h.x, h.y, 3, 160, 'cut-blood-2b', 2.1, 0.16, 2.2);`,
  'cut-road-i1': `const S = await game('sandbox', 23); wx(S, 'clear'); const T = townNear(S); const R = fire(S, 'rkt', 8, T, 40);
    steps(S, 12); const t = R.find(x => !x.dead); if (!t) throw new Error('no rockets');
    const L = await live(S, t, 'side', 1500); L.camK = 4; L.trails = true; await wait(1200); await cutStill(L, 'cut-road-i1', true);`,
  'cut-north-2': `const S = await game('sandbox', 22.2); wx(S, 'clear'); steps(S, 1200);
    const aps = IC.bases(S).filter(b => b.parts && b.id !== 'i0' && !b.mil).sort((p, q) => (p.parts.length - q.parts.length));
    let st = null; for (const b of aps.concat(S.byId.i0)) { st = IC.aptStands(b).find(s => s.occ); if (st) break; }
    if (!st) throw new Error('no aircraft at a stand'); await overAirport(S, st.x, st.y, (st.a || 0) + 2.4, 0.16, 0.8, 'cut-north-2');`,
  'cut-eve-3': `const S = await game('sandbox', 23.4); wx(S, 'clear'); const u = S.units.find(u => u.type === 'lr3d') || S.units.find(u => u.radarOn);
    const L = await liveHere(S, u.x, u.y); orbitAt(L, u.x, u.y, 2.6, 0.1, 0.45, 0.02); S.paused = false; await wait(2500); S.paused = true; await cutStill(L, 'cut-eve-3');`,
  'cut-night-1': `const S = await game('sandbox', 5.8); wx(S, 'scattered'); const B = fire(S, 'srbm', 4, S.byId.i0, 300);
    steps(S, 14); const t = B.find(x => !x.dead); if (!t) throw new Error('no ballistic missile');
    const L = await live(S, t, 'side', 1500); L.camK = 5; L.trails = true; await wait(1200); await cutStill(L, 'cut-night-1', true);`,
  'cut-night-2': `const S = await game('sandbox', 5.9); wx(S, 'scattered'); const u = lrsam(S); fire(S, 'str', 3, u, 170);
    let tr = null; steps(S, 1200, S => (tr = S.rec.tracks.find(t => t.kind === 'missile' && U.dxy(IC.recGet(t, 0, 1), IC.recGet(t, 0, 2), u.x, u.y) < 5)) && S.time > IC.recFirstT(tr) + 20);
    if (!tr) throw new Error('no launch'); const t0 = IC.recFirstT(tr);
    const V = await replay({ x: u.x, y: u.y, t: t0 - 3, r: 150, cam: 'orbit' }, t0 + 2.2);
    V.playing = false; V.cam = 'orbit'; V.follow = null; Object.assign(V.orbit, { tx: u.x - V.cx, tz: u.y - V.cy, ty: (V.flat[0] ? V.flat[0].e : 0) * V.hk + 0.1, yaw: 2.6, pitch: 0.18, dist: 1.4 });
    await wait(1500); await cutStill(V, 'cut-night-2', true);`,
  'cut-letter-1': `const S = await game('sandbox', 16.8); wx(S, 'scattered'); fire(S, 'str', 6, lrsam(S), 120, 4);
    let k = null; steps(S, 3600, S => (k = S.rec.ev.find(e => e.kind === 'kill' || e.kind === 'intercept' || (e.kind === 'mstat' && e.what === 'hit'))) && S.time > k.t + 6);
    if (!k) throw new Error('no kill: ' + [...new Set(S.rec.ev.map(e => e.kind + (e.what ? ':' + e.what : '')))].join(' ')); const tr = S.rec.of.get(k.tref) || S.rec.tracks.find(t => t.kind === 'threat');
    const V = await replay({ follow: tr && tr.ref, x: k.x, y: k.y, t: k.t - 3, r: 120, cam: 'side' }, k.t + 0.6);
    V.playing = false; V.camK = 1.4; await wait(1500); await cutStill(V, 'cut-letter-1', true);`,
  'cut-burn-1': `const S = await game('sandbox', 19.5); wx(S, 'overcast'); steps(S, 600); const t = partOf(S.byId.i0, 'terminal');
    boom.ms = 12000; await boom(S, t.x, t.y, 4, 180, 'cut-burn-1', 2.5, 0.14, 2.4);`,
  'cut-held-1': `const S = await game('sandbox', 21.6); wx(S, 'clear'); const T = S.byId.i0; fire(S, 'owa', 8, T, 80); fire(S, 'lacm', 5, T, 110);
    let n = 0; steps(S, 2400, S => (n = S.rec.ev.filter(e => e.kind === 'kill' || e.kind === 'intercept').length) >= 4);
    const hit = S.rec.ev.filter(e => e.kind === 'kill' || e.kind === 'intercept')[3] || S.rec.ev.find(e => e.kind === 'kill');
    if (!hit) throw new Error('no intercepts');
    const V = await replay({ x: hit.x, y: hit.y, t: hit.t - 8, r: 150, cam: 'orbit' }, hit.t + 0.3, { tx: 0, tz: 0, ty: 0.5, yaw: 1.6, pitch: 0.2, dist: 14 });
    V.playing = false; V.trails = true; await wait(1500); await cutStill(V, 'cut-held-1', true);`,
  'cut-crash-1': `const S = await game('sandbox', 18.4); wx(S, 'scattered');
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.kind === 'arr' && m.phase === 'rollout' && m.type !== 'light'));
    if (!m) throw new Error('no landing roll'); const ap = IC.bases(S).find(b => (b.moves || []).includes(m)) || S.byId.i0;
    IC.fireRun(S, ap, m, 'crash'); steps(S, 70); m.stop = 1e9;
    await boom(S, m.x, m.y, 2, 40, 'cut-crash-1', (m.h || 0) + 2.2, 0.12, 1.4);`,
  'cut-review-g': `const S = await game('sandbox', 18.1); wx(S, 'clear'); steps(S, 1800); const t = partOf(S.byId.i0, 'terminal');
    await overAirport(S, t.x, t.y, 2.0, 0.28, 7, 'cut-review-g');`,
  'cut-endL-2': `const S = await game('sandbox', 6.1); wx(S, 'clear'); const b = IC.bases(S).filter(b => b.parts && runwayOf(b)).sort((p, q) => p.parts.length - q.parts.length)[0];
    const r = runwayOf(b), a = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x); await overAirport(S, r.a.x, r.a.y, -a + Math.PI / 2 + Math.PI, 0.07, 2.2, 'cut-endL-2');`,
  'cut-endO-1': `const S = await game('sandbox', 8.4); wx(S, 'scattered'); await landing(S, 'cut-endO-1', 'chase', 1.4);`,
  'cut-endP-3': `const S = await game('sandbox', 15); wx(S, 'overcast');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'roll' && m.spd < 0.05 && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('no take-off'); const L = await live(S, m, 'side', 800); L.camK = 0.8;
    S.paused = false; S.speed = 1; for (let i = 0; i < 200 && m.phase === 'roll'; i++) await wait(100); await wait(3000); S.paused = true; await wait(500);
    await cutStill(L, 'cut-endP-3');`,
  'cut-endF-1': `const S = await game('sandbox', 12.5); wx(S, 'overcast'); steps(S, 600); const b = IC.mainBase(S);
    const u = S.units.filter(u => U.dist(u, b) < 60).sort((p, q) => U.dist(p, b) - U.dist(q, b))[0] || b;
    await overAirport(S, (u.x + b.x) / 2, (u.y + b.y) / 2, 2.2, 0.3, 6, 'cut-endF-1');`
};
for (const k in SCENES) SCENES[k] = CUT_LIB + SCENES[k];
module.exports = SCENES;
