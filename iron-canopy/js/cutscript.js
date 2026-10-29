/* Iron Canopy — (brief 75) the cutscenes animated: each comic page of cutscenes.js played as a timed, scripted
   scene. Headless: the timeline and the staged 3D shots; render-cutscene.js plays them.
   - IC.cutTimeline(S, c) turns a queued or seen cutscene into shots, one a panel: how long it holds (from its
     words, read at IC.CUTMO.read), the camera's move over the picture (cam: from and to { x, y, s }, the point
     looked at in the picture's own 0..1 and the zoom), the weather and light over it (fx), the moments in it
     (beats: the caption, the balloon, a flash, a shake, a sound), and how it gives way to the next (trans).
     A panel may say any of these itself (dur, cam, at, fx, beats, trans); what it leaves out is read from its
     shot line: "close on" pushes in, a crowd pans, rain falls when it rains.
   - A panel with stage: { id, part, hour, model, wx } plays a 3D shot instead of its picture: IC.CUT_STAGES[id] writes a short
     record (actors flown on scripted paths, explosions at set times) round a place of this game (the national
     airport, its main runway, the capital), and film camera shots over it (render3d-war.js W3.cam). Panels in a
     row with the same stage share one scene, each with its part's shots. IC.cutStage(S, id) builds it on a copy
     of the state (Object.create(S)), with its own clock and record, so the game is not touched; no place for it
     (a world with no airport yet) and the panel keeps its picture. */
(function (IC) {
'use strict';
const U = IC.U;

const MO = IC.CUTMO = {
  read: 3.1,          // words a second the narration is read at
  type: 38,           // characters a second a caption types in
  capAt: 0.7,         // seconds into a shot before the caption starts
  sayGap: 0.5,        // seconds after the caption before the balloon
  min: 4.5, max: 15,  // a shot's length, least and most (seconds)
  tail: 1.4,          // seconds a shot holds after its words are read
  title: 2.6          // the title card
};

/* a stable number from a string, 0..1 */
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; };
const words = s => s ? s.split(/\s+/).filter(Boolean).length : 0;
const has = (s, re) => re.test(s || '');

/* camera moves over a picture: the point looked at (0..1 across and down) and the zoom, from and to */
const CAMS = IC.CUT_CAMS = {
  still: (a) => ({ x0: a[0], y0: a[1], s0: 1.06, x1: a[0], y1: a[1], s1: 1.08 }),
  push: (a) => ({ x0: 0.5, y0: 0.5, s0: 1.04, x1: a[0], y1: a[1], s1: 1.26 }),
  slam: (a) => ({ x0: 0.5, y0: 0.5, s0: 1.02, x1: a[0], y1: a[1], s1: 1.45, ease: 'out' }),
  pull: (a) => ({ x0: a[0], y0: a[1], s0: 1.3, x1: 0.5, y1: 0.5, s1: 1.04 }),
  panL: (a) => ({ x0: 0.62, y0: a[1], s0: 1.18, x1: 0.38, y1: a[1], s1: 1.18 }),
  panR: (a) => ({ x0: 0.38, y0: a[1], s0: 1.18, x1: 0.62, y1: a[1], s1: 1.18 }),
  rise: (a) => ({ x0: a[0], y0: 0.64, s0: 1.2, x1: a[0], y1: 0.38, s1: 1.14 }),
  sink: (a) => ({ x0: a[0], y0: 0.38, s0: 1.14, x1: a[0], y1: 0.62, s1: 1.2 }),
  drift: (a) => ({ x0: a[0] - 0.04, y0: a[1] + 0.02, s0: 1.1, x1: a[0] + 0.04, y1: a[1] - 0.02, s1: 1.16 })
};
/* what a panel's shot line asks of the camera, when the panel does not say */
function camFor(p, i, n) {
  const s = (p.shot || '').toLowerCase(), k = hash(p.art || String(i));
  if (has(s, /\bclose on\b|close-up|\bclose\b|through an? .*window|inside the cockpit/)) return 'push';
  if (has(s, /fireball|explosion|blast|impact|about to hit|warning lights/)) return 'slam';
  if (has(s, /years later|seen from behind|from the tower|empty|alone|memorial|in ruins/)) return i === n - 1 ? 'pull' : 'still';
  if (has(s, /crowd|rows of|line of|landscape|horizon|over the|along|skyline|far off/)) return k < 0.5 ? 'panL' : 'panR';
  if (has(s, /taking off|climb|rises|into a .*sky|launch/)) return 'rise';
  if (has(s, /falling|descend|on (short )?final|landing/)) return 'sink';
  if (i === n - 1) return 'pull';
  return ['push', 'drift', 'panR', 'push', 'panL', 'drift'][Math.floor(k * 6)];
}
/* the light and weather over a picture, from its shot line */
function fxFor(p) {
  const s = (p.shot || '').toLowerCase(), fx = [];
  if (has(s, /\brain\b|drizzle|downpour|wet/)) fx.push('rain');
  if (has(s, /\bsnow/)) fx.push('snow');
  if (has(s, /fire|burn|flame|ember|blaz/)) fx.push('embers');
  if (has(s, /\bfog\b|\bmist\b|haze|\bin cloud|smoke/)) fx.push('fog');
  if (has(s, /lightning|thunder|storm/)) fx.push('lightning');
  if (has(s, /ruin|rubble|dust|crater|debris|wreck/)) fx.push('dust');
  if (has(s, /radar|scope|screen|monitor|television|tape recorder|reel/)) fx.push('scan');
  if (has(s, /\bnight\b|\bdark\b|moonlight|candle/)) fx.push('night');
  if (has(s, /dawn|sunrise|golden|morning light|evening/)) fx.push('glow');
  if (has(s, /blue lights|siren|emergency|fire trucks/)) fx.push('strobe');
  return fx;
}
/* how a panel gives way to the next */
function transFor(p, prev) {
  const s = (p.shot || '').toLowerCase();
  if (!prev) return 'fade';
  if (has(s, /^years later|^morning|^later|^dawn|^night\.|fourteen years|thirty/)) return 'dip';
  if (has(s, /fireball|explosion|flash|impact|about to hit/)) return 'flash';
  if (prev.stage && p.stage && prev.stage.id === p.stage.id) return 'cut';
  return hash((p.art || '') + 'x') < 0.5 ? 'slide' : 'fade';
}

/* the shots of a cutscene, in order, with their times */
IC.cutTimeline = function (S, c) {
  const C = IC.CUTSCENES[c.id], P = IC.cutPanels(S, c), raw = C.panels.filter(p => !p.only || p.only === c.v);
  const shots = []; let t = 0, prev = null;
  P.forEach((p, i) => {
    const r = raw[i] || {}, at = r.at || [0.5, 0.45];
    const capW = words(p.cap), sayW = p.say ? words(p.say[1]) : 0;
    const capEnd = p.cap ? MO.capAt + p.cap.length / MO.type : 0;
    const sayT = p.say ? (p.cap ? capEnd + MO.sayGap : MO.capAt) : null;
    const readEnd = Math.max(MO.capAt + capW / MO.read, capEnd) + (p.say ? MO.sayGap + Math.max(sayW / MO.read, p.say[1].length / MO.type) : 0);
    const stg = r.stage ? Object.assign({}, r.stage) : null;
    let dur = r.dur || U.clamp(readEnd + MO.tail, MO.min, MO.max);
    if (stg && IC.CUT_STAGES[stg.id]) { const part = (IC.CUT_STAGES[stg.id].parts || [])[stg.part || 0]; if (part && part.dur) dur = Math.max(dur, part.dur); }
    const camK = typeof r.cam === 'object' ? null : r.cam || camFor(r, i, P.length);
    const cam = typeof r.cam === 'object' ? r.cam : (CAMS[camK] || CAMS.drift)(at);
    const fx = r.fx ? [].concat(r.fx) : fxFor(r);
    const beats = [];
    if (p.cap) beats.push({ t: MO.capAt, k: 'cap' });
    if (p.say) beats.push({ t: sayT, k: 'say' });
    if (camK === 'slam') beats.push({ t: 0.15, k: 'flash' }, { t: 0.2, k: 'shake', a: 1 });
    if (fx.includes('lightning')) beats.push({ t: dur * 0.35, k: 'flash', a: 0.6 }, { t: dur * 0.72, k: 'flash', a: 0.4 });
    for (const b of r.beats || []) beats.push(Object.assign({}, b));
    beats.sort((a, b) => a.t - b.t);
    const sh = { i, art: p.art, src: p.src, shot: p.shot, cap: p.cap, say: p.say, t0: t, dur, cam, camK, fx, beats, trans: r.trans || transFor(r, prev), stage: stg };
    shots.push(sh); t += dur; prev = r;
  });
  return { id: c.id, title: C.title, shots, total: t };
};
/* where a cutscene is at a moment: the shot and the time into it */
IC.cutAt = function (TL, t) {
  for (const sh of TL.shots) if (t < sh.t0 + sh.dur) return { sh, k: Math.max(0, t - sh.t0) };
  const sh = TL.shots[TL.shots.length - 1];
  return sh ? { sh, k: sh.dur } : null;
};
/* the camera over a picture at time k into its shot: { x, y, s } (eased; 'out' eases out only) */
IC.cutCam = function (sh, k) {
  const c = sh.cam, e = U.clamp(k / Math.max(0.1, sh.dur), 0, 1);
  const q = c.ease === 'out' ? 1 - Math.pow(1 - e, 3) : IC.filmEase ? IC.filmEase(e) * 0.7 + e * 0.3 : e;
  return { x: c.x0 + (c.x1 - c.x0) * q, y: c.y0 + (c.y1 - c.y0) * q, s: c.s0 + (c.s1 - c.s0) * q };
};
/* how much of a caption shows at time k into its shot (characters) */
IC.cutTyped = (sh, k, which) => {
  const b = sh.beats.find(x => x.k === which); if (!b) return 0;
  const s = which === 'say' ? sh.say && sh.say[1] : sh.cap;
  return s ? U.clamp(Math.floor((k - b.t) * MO.type), 0, s.length) : 0;
};

/* ---------- the staged 3D shots ---------- */
const DAY = 2 * 86400;
const runwayOf = ap => (ap.parts || []).filter(p => p.kind === 'runway' && p.built && p.a && p.b).sort((p, q) => U.dist(q.a, q.b) - U.dist(p.a, p.b))[0];
/* the airport a cutscene is about: the one passed in, the national airport, else the biggest we have with a runway */
IC.cutAirport = function (S, d) {
  const ok = ap => ap && ap.kind === 'airport' && ap.parts && runwayOf(ap);
  const st = S.story || {}, named = d && d.ap && typeof d.ap === 'object' ? d.ap : null;
  if (ok(named)) return named;
  if (st.cap && ok(S.byId[st.cap])) return S.byId[st.cap];
  return IC.bases(S).filter(ok).sort((a, b) => b.parts.length - a.parts.length)[0] || null;
};
IC.cutRunway = runwayOf;
const livery = S => { const al = S.av && S.av.airlines && S.av.airlines.find(a => !a.K || !a.K.foreign); return al ? al.livery : null; };
/* the hostile side's bearing from a place: towards the nearest enemy site, else north */
const fromEnemy = (S, p) => { const e = (S.esites || []).slice().sort((a, b) => U.dist(a, p) - U.dist(b, p))[0]; return e ? Math.atan2(e.y - p.y, e.x - p.x) : -Math.PI / 2; };
const GLIDE = Math.tan(3 * Math.PI / 180) * 0.1;   // km of height for each unit (100 m) back along a 3° glide
const P = IC.REC_PHASE;

/* Each stage: where(S, d) → the place or null; build(S, d, at) → { hour, actors, events, shots } in stage seconds
   (0 is when the first part starts). An actor: { key, kind, model, name, side, meta, t0, t1, d (a threat type),
   fly(t) → { x, y, alt, h, spd, code } }. A shot: { t, dur, mode, ref (an actor's key), lookAt, from, ... }.
   parts: the length of each part (its panel holds at least that long); the part's shots start at its own 0. */
IC.CUT_STAGES = {
  /* an airliner lands on the national airport's main runway: from beside the approach, at touchdown, the roll */
  landing: {
    parts: [{ dur: 20 }],
    where: (S, d) => IC.cutAirport(S, d),
    build(S, d, ap) {
      const r = runwayOf(ap), h = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x), cx = Math.cos(h), cy = Math.sin(h), rx = -cy, ry = cx;
      const td = { x: r.a.x + cx * 3.5, y: r.a.y + cy * 3.5 }, v0 = 0.72, tTD = 13;
      const fly = t => {
        if (t < tTD) { const back = v0 * (tTD - t), k = U.clamp((tTD - t) / 4, 0, 1); return { x: td.x - cx * back, y: td.y - cy * back, alt: back * GLIDE * (0.55 + 0.45 * k), h, spd: v0, code: P.final }; }
        const a = t - tTD, v = Math.max(0.16, v0 - 0.05 * a), s = v0 * a - 0.025 * a * a;
        return { x: td.x + cx * s, y: td.y + cy * s, alt: 0, h, spd: v, code: a < 2.5 ? P.land : P.rollout };
      };
      return {
        hour: d && d.hour != null ? d.hour : 10.2, wx: 'clear', at: td,
        actors: [{ key: 'ac', kind: 'gnd', model: d && d.model || 'narrow', name: 'First arrival', side: 'civil', meta: { type: d && d.model || 'narrow', livery: livery(S), civil: true, ap: ap.id }, t0: -30, t1: 24, fly }],
        shots: [
          { t: 0, dur: 7, mode: 'fixed', ref: 'ac', from: { x: td.x - cx * 3 + rx * 0.9, y: td.y - cy * 3 + ry * 0.9, h: 6 }, lens: [85, 50], lag: 0.25 },
          { t: 7, dur: 7.5, mode: 'fixed', ref: 'ac', from: { x: td.x + cx * 2 + rx * 0.9, y: td.y + cy * 2 + ry * 0.9, h: 4 }, lens: [50, 35], lag: 0.3 },
          { t: 14.5, dur: 6, mode: 'chase', ref: 'ac', back: 0.75, up: 0.1, side: 0.2, lens: 32, ease: 0.4 }
        ]
      };
    }
  },
  /* an airliner takes off from the national airport, climbs away over the camera and into the haze */
  takeoff: {
    parts: [{ dur: 19 }],
    where: (S, d) => IC.cutAirport(S, d),
    build(S, d, ap) {
      const r = runwayOf(ap), h = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x), cx = Math.cos(h), cy = Math.sin(h), rx = -cy, ry = cx;
      const A = 0.024, vR = 0.78, tR = vR / A, t0 = -tR + 8;   // the roll starts tR - 8 s before 0, so rotation is at 8 s
      const sR = 0.5 * A * tR * tR, a0 = { x: r.a.x + cx * 1.5, y: r.a.y + cy * 1.5 };
      const fly = t => {
        const a = t - t0;
        if (a < tR) { const s = 0.5 * A * a * a; return { x: a0.x + cx * s, y: a0.y + cy * s, alt: 0, h, spd: A * a, code: P.roll }; }
        const b = a - tR, s = sR + vR * b + 0.006 * b * b;
        return { x: a0.x + cx * s, y: a0.y + cy * s, alt: Math.min(3, 0.0045 * b * b / (1 + b / 12) + 0.008 * b), h, spd: vR + 0.012 * b, code: P.air };
      };
      const lift = fly(8);
      return {
        hour: d && d.hour != null ? d.hour : 15, wx: 'overcast', at: lift,
        actors: [{ key: 'ac', kind: 'gnd', model: d && d.model || 'narrow', name: 'Departure', side: 'civil', meta: { type: d && d.model || 'narrow', livery: livery(S), civil: true, ap: ap.id }, t0, t1: 26, fly }],
        shots: [
          { t: 0, dur: 6.5, mode: 'along', ref: 'ac', side: 0.55, up: 0.02, ahead: 0.1, lens: 45, ease: 0.25 },
          { t: 6.5, dur: 6.5, mode: 'fixed', ref: 'ac', from: { x: lift.x + cx * 9 + rx * 0.9, y: lift.y + cy * 9 + ry * 0.9, h: 1.7 }, lens: [50, 24], lag: 0.2 },
          { t: 13, dur: 6, mode: 'fixed', ref: 'ac', from: { x: lift.x - cx * 4 + rx * 3, y: lift.y - cy * 4 + ry * 3, h: 2 }, lens: [90, 200], lag: 0.5 }
        ]
      };
    }
  },
  /* a regional turboprop climbing in cloud, and a drone with no lights crossing its path */
  collision: {
    parts: [{ dur: 8 }, { dur: 7 }],
    where: (S, d) => { const ap = IC.cutAirport(S, d); return ap || IC.cap(S) || null; },
    build(S, d, ap) {
      const h = fromEnemy(S, ap) + 0.9, cx = Math.cos(h), cy = Math.sin(h), rx = -cy, ry = cx, tC = 11.5, v = 1.25, vd = 0.45;
      const C = { x: ap.x + cx * 140, y: ap.y + cy * 140, alt: 2.6 };
      const air = t => {
        const a = t - tC, s = v * a, dip = a > 0 ? 0.004 * a * a : 0;
        return { x: C.x + cx * s + (a > 0 ? rx * 0.01 * a * a : 0), y: C.y + cy * s + (a > 0 ? ry * 0.01 * a * a : 0), alt: C.alt + 0.006 * a - dip, h: h + (a > 0 ? 0.02 * a : 0), spd: v, code: P.air };
      };
      const hd = h + Math.PI / 2 + 0.25, dx = Math.cos(hd), dy = Math.sin(hd);
      const drone = t => { const s = vd * (t - tC); return { x: C.x + dx * s + cx * 0.02, y: C.y + dy * s + cy * 0.02, alt: C.alt + 0.004, h: hd, spd: vd, code: P.air }; };
      return {
        hour: 15.5, wx: 'overcast', at: C,
        actors: [
          { key: 'ac', kind: 'threat', model: 'turbo', name: 'Regional airliner', side: 'civil', meta: { type: 'civ', klass: 'airliner', civil: true, livery: livery(S) }, t0: -20, t1: 28, fly: air },
          { key: 'dr', kind: 'threat', model: 'isr', name: 'Drone', side: 'enemy', d: IC.THR.isr, meta: { type: 'isr', klass: 'drone' }, t0: -20, t1: tC, fly: drone }
        ],
        events: [{ t: tC, kind: 'collision', x: C.x, y: C.y, alt: C.alt, sz: 0.55, name: 'Collision', text: 'Collision' }],
        shots: [
          { t: 0, dur: 8, mode: 'along', ref: 'ac', side: 0.32, up: 0.035, ahead: 0.05, lens: [35, 45], ease: 0.3 },
          { t: 8, dur: 3.2, mode: 'chase', ref: 'dr', back: 0.07, up: 0.012, side: 0.015, lookAt: 'ac', lens: 40, lag: 0.15 },
          { t: 11.2, dur: 3.8, mode: 'fixed', ref: 'ac', from: { x: C.x - cx * 1.2 + rx * 0.7, y: C.y - cy * 1.2 + ry * 0.7, alt: C.alt + 0.05 }, lens: [45, 70], lag: 0.25 }
        ]
      };
    }
  },
  /* one of their fighters slides in off an airliner's wingtip, high above the cloud */
  shadow: {
    parts: [{ dur: 16 }],
    where: (S, d) => IC.cutAirport(S, d) || IC.cap(S) || null,
    build(S, d, ap) {
      const h = fromEnemy(S, ap) + Math.PI / 2, cx = Math.cos(h), cy = Math.sin(h), rx = -cy, ry = cx, v = 2.3;
      const O = { x: ap.x + Math.cos(h - Math.PI / 2) * 220, y: ap.y + Math.sin(h - Math.PI / 2) * 220 }, alt = 10.6;
      const air = t => ({ x: O.x + cx * v * t, y: O.y + cy * v * t, alt, h, spd: v, code: P.air });
      const ftr = t => {
        const k = U.clamp((t + 2) / 11, 0, 1), e = k * k * (3 - 2 * k);
        const back = 1.6 * (1 - e) + 0.02 * e, side = 0.75 * (1 - e) + 0.42 * e, up = -0.12 * (1 - e) + 0.004 * e;
        return { x: O.x + cx * (v * t - back) + rx * side, y: O.y + cy * (v * t - back) + ry * side, alt: alt + up, h: h + 0.06 * (1 - e) * Math.sin(t * 0.6), spd: v, code: P.air };
      };
      return {
        hour: 11, wx: 'scattered', at: O,
        actors: [
          { key: 'ac', kind: 'threat', model: 'narrow', name: 'Airliner', side: 'civil', meta: { type: 'civ', klass: 'airliner', civil: true, livery: livery(S) }, t0: -10, t1: 20, fly: air },
          { key: 'f', kind: 'threat', model: 'ftr_e', name: 'Their fighter', side: 'enemy', d: IC.THR.ftr, meta: { type: 'ftr', klass: 'fighter' }, t0: -10, t1: 20, fly: ftr }
        ],
        shots: [
          { t: 0, dur: 6, mode: 'chase', ref: 'f', back: 0.22, up: 0.035, side: 0.05, lookAt: 'ac', lens: 40, ease: 0.3 },
          { t: 6, dur: 5, mode: 'along', ref: 'ac', side: -0.55, up: 0.06, ahead: 0.25, lookAt: 'f', lens: 30, ease: 0.4 },
          { t: 11, dur: 5, mode: 'orbit', ref: 'ac', dist: 0.95, up: 0.12, rate: 0.14, yaw0: h + 2.2, lens: 30 }
        ]
      };
    }
  },
  /* the first night: ballistic missiles fall on the capital, the battery fires, two are hit high up, one is not */
  salvo: {
    parts: [{ dur: 8 }, { dur: 9 }],
    where: (S, d) => IC.cutAirport(S, d) || IC.cap(S) || null,
    build(S, d, ap) {
      const hb = fromEnemy(S, ap), bx = Math.cos(hb), by = Math.sin(hb);
      const L = { x: ap.x + Math.cos(hb + 1.9) * 35, y: ap.y + Math.sin(hb + 1.9) * 35 };
      const tgt = [{ x: ap.x + 6, y: ap.y - 4 }, { x: ap.x - 8, y: ap.y + 5 }, { x: ap.x + bx * 4, y: ap.y + by * 4 }];
      const tI = [9, 11.5, null], tImp = 15.5, vh = 9, vz = 1.6;   // horizontal units a second, km a second down
      const bm = i => t => {
        const left = (tI[i] != null ? tI[i] + 4 : tImp) - t, T = tgt[i];
        return { x: T.x + bx * vh * left, y: T.y + by * vh * left, alt: Math.max(0, vz * left + 0.02 * left * left), h: hb + Math.PI, spd: vh, code: P.air };
      };
      const meet = i => bm(i)(tI[i]);
      const sam = (i, tl) => t => {
        const M = meet(i), k = U.clamp((t - tl) / (tI[i] - tl), 0, 1), e = Math.pow(k, 1.35);
        const lift = Math.sin(k * Math.PI) * 6;
        return { x: L.x + (M.x - L.x) * e, y: L.y + (M.y - L.y) * e, alt: 0.01 + M.alt * Math.pow(k, 0.8) + lift * 0.1, h: Math.atan2(M.y - L.y, M.x - L.x), spd: 15, code: k < 0.75 ? 1 : 6 };
      };
      const actors = [{ key: 'bat', kind: 'unit', model: 'lrsam', name: 'Long-range battery', side: 'us', meta: { type: 'lrsam', n: 4 }, t0: -20, t1: 24, fly: () => ({ x: L.x, y: L.y, alt: 0, h: hb, spd: 0, code: 0 }) }];
      for (let i = 0; i < 3; i++) actors.push({ key: 'b' + i, kind: 'threat', model: 'bm', name: 'Ballistic missile', side: 'enemy', d: IC.THR.srbm, meta: { type: 'srbm', klass: 'ballistic' }, t0: -6, t1: tI[i] != null ? tI[i] : tImp, fly: bm(i) });
      const tl = [2.2, 4.4];
      for (let i = 0; i < 2; i++) actors.push({ key: 's' + i, kind: 'missile', model: 'sam', name: 'Interceptor', side: 'us', meta: { mun: 'LR', tref: 'b' + i, uref: 'bat', seeker: 'ARH' }, t0: tl[i], t1: tI[i], fly: sam(i, tl[i]) });
      const events = [
        { t: tl[0], kind: 'launch', x: L.x, y: L.y, alt: 0, sz: 0.3, quiet: true },
        { t: tl[1], kind: 'launch', x: L.x, y: L.y, alt: 0, sz: 0.3, quiet: true },
        { t: tI[0], kind: 'intercept', ...meet(0), sz: 0.9, tref: 'b0', mref: 's0' },
        { t: tI[1], kind: 'intercept', ...meet(1), sz: 0.9, tref: 'b1', mref: 's1' },
        { t: tImp, kind: 'impact', x: tgt[2].x, y: tgt[2].y, alt: 0, sz: 1.6, dmg: [], tref: 'b2' }
      ];
      const M0 = meet(0);
      return {
        hour: d && d.hour != null ? d.hour : 6.4, wx: 'clear', at: L, actors, events,
        shots: [
          { t: 0, dur: 4.6, mode: 'fixed', ref: 'bat', from: { x: L.x - bx * 0.6 + by * 0.3, y: L.y - by * 0.6 - bx * 0.3, h: 25 }, lookAt: { x: (L.x + M0.x) / 2, y: (L.y + M0.y) / 2, alt: 1.6 }, lens: [24, 30] },
          { t: 4.6, dur: 3.4, mode: 'chase', ref: 's0', back: 0.5, up: 0.08, lookAt: 'b0', lens: 28, lag: 0.2 },
          { t: 8, dur: 9, mode: 'fixed', ref: 'b2', from: { x: ap.x - bx * 60 + by * 25, y: ap.y - by * 60 - bx * 25, h: 60 }, lookAt: { x: ap.x + bx * 25, y: ap.y + by * 25, alt: 3.2 }, lens: [24, 32] }
        ]
      };
    }
  }
};

/* the stage itself: a copy of the state with its own clock and a record written from the actors' paths */
IC.cutStage = function (S, id, d, opt) {
  const G = IC.CUT_STAGES[id]; if (!G) return null;
  if (opt) { d = Object.assign({}, d); for (const k of ['hour', 'model', 'wx']) if (opt[k] != null) d[k] = opt[k]; }
  const at = G.where(S, d); if (!at) return null;
  const B = G.build(S, d, at); if (!B) return null;
  const T0 = DAY + Math.round((B.hour != null ? B.hour : 12) * 3600);
  const R = IC.recStage(S, T0 - 60), refs = {};
  for (const a of B.actors) refs[a.key] = { id: 'cut_' + a.key, cut: a.key, d: a.d || null, x: 0, y: 0, alt: 0 };
  for (const a of B.actors) {
    const ref = refs[a.key], meta = Object.assign({}, a.meta);
    for (const k of ['tref', 'uref']) if (typeof meta[k] === 'string') meta[k] = refs[meta[k]] || null;
    const tr = IC.recStageTrack(R, ref, a.kind, a.model, a.name, a.side, meta);
    // every quarter second, and the last moment exactly (where an interceptor meets its missile)
    const n = Math.ceil((a.t1 - a.t0) / IC.REC.fine - 1e-6);
    for (let i = 0; i <= n; i++) {
      const t = Math.min(a.t1, a.t0 + i * IC.REC.fine), p = a.fly(t);
      IC.recStagePush(tr, T0 + t, p.x, p.y, Math.max(0, p.alt || 0), p.h || 0, p.spd || 0, p.code, a.kind === 'unit');
      Object.assign(ref, { x: p.x, y: p.y, alt: p.alt || 0 });
    }
    tr.live = false;
  }
  for (const e of B.events || []) {
    const ev = Object.assign({}, e, { t: T0 + e.t });
    for (const k of ['tref', 'mref']) if (typeof ev[k] === 'string') ev[k] = refs[ev[k]] || null;
    if (!ev.text) ev.text = ev.kind;
    IC.recStageEvent(R, ev);
  }
  R.ev.sort((a, b) => a.t - b.t);
  const stage = Object.create(S);
  Object.defineProperty(stage, 'rec', { value: R, enumerable: false, configurable: true, writable: true });
  stage.time = T0 + Math.max(...(G.parts || [{ dur: 15 }]).map((p, i, A) => A.slice(0, i + 1).reduce((s, q) => s + q.dur, 0))) + 4;
  stage.paused = true; stage.staged = id;
  // a late spring day's light: the stage clock's day would read as January, when dawn is still dark at 07:00
  stage.cal = null;
  // its own weather, held: the game's fog or storm is not the scene's
  const wx = d && d.wx || B.wx || 'scattered';
  stage.weather = Object.assign({}, S.weather || {}, { kind: wx, prev: wx, fade: 1, hold: true, force: null });
  // the parts' shots, in stage seconds, with their actors as the things they follow
  const ref = x => typeof x === 'string' ? refs[x] : x;
  const shots = B.shots.map(s => Object.assign({}, s, { ref: ref(s.ref), lookAt: ref(s.lookAt), t0: T0 + s.t }));
  let pt = 0; const parts = (G.parts || [{ dur: 15 }]).map(p => { const o = { t0: T0 + pt, dur: p.dur }; pt += p.dur; return o; });
  return { id, S: stage, R, T0, at: B.at || at, refs, shots, parts, hour: B.hour, actors: B.actors.map(a => a.key) };
};

})(window.IC);
