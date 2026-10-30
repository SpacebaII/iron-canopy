/* Iron Canopy — what makes an intercept hard, drawn (brief 79). intercept.js names the factors against each shot and
   puts every miss down to one of them; this draws them as things seen on the map, never as numbers:
   - ground clutter: a low track sits in a speckle of the ground's own echo, with false echoes blinking round it
   - a terminal manoeuvre: the warhead's last seconds leave a hot weaving line; a missile it beat overshoots, its
     steering jets puffing as it tries to turn back
   - speed: shock lines off a fast cruise missile's nose; a blast round that fused late bursts behind its target
   - weather: a heat-seeker in rain or cloud flies in mist with its seeker wandering, and one that lost the target
     veers off into the murk; a radar link through heavy rain breaks up, flickering
   - range and energy: a round that arrived slow, or ran out of energy, tumbles down trailing thin smoke
   - saturation: a hostile track every battery in reach is too busy for is bracketed, with a line to the battery
     it waits on
   render-combat.js calls IC.drawIntercept at the end of its frame, and IC.icptTakeGhost for a missile that missed. */
(function (IC) {
'use strict';
const U = IC.U, cam = IC.cam, RS = IC.rs;
let ctx = null, lastNow = 0, dtR = 0;
const inView = (x, y, m) => RS.inView(x, y, m);
const VIEW = {};
const hist = new Map();   // threat → where it was drawn over its last seconds, while it jinks
const fx = [];            // misses being played out
const waits = new Map();  // threat → { at, u }: the battery it waits on, worked out a few times a second
const SPR = {};
function sprite(key, rgb) {
  if (SPR[key]) return SPR[key];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},0.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (SPR[key] = c);
}
const blob = (key, rgb, x, y, r, a) => { if (a <= 0.01 || r <= 0) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sprite(key, rgb), x - r, y - r, r * 2, r * 2); };
// a hash in [0, 1): the same speckle for the same instant, so it flickers in steps instead of boiling
const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const BAL = { bal: 1, hgv: 1 };

/* ---------- while it flies ---------- */
function clutter(S, t, v, px, now) {
  const k = Math.floor(now * 7), R = 20 * px;
  ctx.fillStyle = 'rgba(150,232,170,1)';
  for (let i = 0; i < 22; i++) {
    const h = hash(i, k, t.seed || 1), a = hash(i, k + 0.5, 3) * 6.283, r = R * Math.sqrt(h);
    ctx.globalAlpha = 0.2 + 0.45 * hash(i, k, 7);
    const s = (0.9 + 1.4 * hash(i, 2, k)) * px;
    ctx.fillRect(v.x + Math.cos(a) * r - s / 2, v.y + Math.sin(a) * r * 0.8 - s / 2, s, s);
  }
  // two false echoes as big as the real one, blinking where nothing is
  ctx.strokeStyle = 'rgba(255,150,120,1)'; ctx.lineWidth = 1 * px;
  for (let i = 0; i < 2; i++) {
    const kk = Math.floor(now * 2.5 + i * 0.5), on = hash(i, kk, t.seed || 1);
    if (on < 0.35) continue;
    const a = hash(i, kk, 9) * 6.283, r = (9 + 9 * hash(kk, i, 5)) * px, x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r * 0.8;
    ctx.globalAlpha = 0.35 * on; ctx.strokeRect(x - 2.5 * px, y - 2.5 * px, 5 * px, 5 * px);
  }
  ctx.globalAlpha = 1;
}
/* a warhead or cruise missile in its last manoeuvres: is it jinking now? */
function jinking(t) {
  if (!t.d.evasive) return false;
  if (t.d.move === 'bal') return t.T && t.age / t.T > 0.8;
  if (t.d.move === 'hgv') return (t.alt || 0) < 35;
  return t.aim && U.dxy(t.x, t.y, t.aim.x, t.aim.y) < 450 && t.type !== 'scm';
}
function jink(S, t, v, px) {
  let H = hist.get(t);
  if (!H) { H = []; hist.set(t, H); }
  const n = H.length;
  if (!n || Math.abs(H[n - 3] - v.x) + Math.abs(H[n - 2] - v.y) > px * 1.5) H.push(v.x, v.y, S.time);
  while (H.length && S.time - H[2] > 30) H.splice(0, 3);
  if (H.length < 9) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const m = H.length / 3;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < m; i++) {
      const f = i / m;
      ctx.globalAlpha = (pass ? 0.9 : 0.25) * f * f;
      ctx.strokeStyle = pass ? 'rgba(255,214,170,1)' : 'rgba(255,120,80,1)';
      ctx.lineWidth = (pass ? 1.3 : 5) * px * (0.4 + 0.6 * f);
      ctx.beginPath(); ctx.moveTo(H[i * 3 - 3], H[i * 3 - 2]); ctx.lineTo(H[i * 3], H[i * 3 + 1]); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}
/* faster than the fuse likes: shock lines back from its nose */
function shock(t, v, px) {
  const sp = U.hyp(v.vx || t.vx || 0, v.vy || t.vy || 0); if (sp < 0.1) return;
  const ux = (v.vx || t.vx) / sp, uy = (v.vy || t.vy) / sp, k = 1 - IC.icptFast(t);
  const L = (10 + 30 * k) * px, w = 0.42;
  ctx.strokeStyle = 'rgba(210,235,255,1)'; ctx.lineWidth = 1 * px;
  const nx = v.x + ux * 5 * px, ny = v.y + uy * 5 * px;
  for (const s of [-1, 1]) for (let j = 0; j < 2; j++) {
    const a = Math.atan2(-uy, -ux) + s * w * (1 + j * 0.35), l = L * (1 - j * 0.3);
    ctx.globalAlpha = (0.5 - j * 0.2) * (0.5 + k);
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + Math.cos(a) * l, ny + Math.sin(a) * l); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/* our missiles in flight: the battery's link to one it guides, and the weather round a heat-seeker */
function inFlight(S, px, now) {
  const vis = IC.cfx && IC.cfx.vis; if (!vis) return;
  for (const m of S.missiles) {
    if (m.side !== 'us') continue;
    const V = vis.get(m.id); if (!V || !V.shown) continue;
    const x = V.hx, y = V.hy, sk = m.M && m.M.seeker, u = m.unit;
    if (!inView(x, y, 300)) continue;
    const rain = IC.icptHas(m, 'weather') && sk !== 'IR', clut = IC.icptHas(m, 'clutter');
    // the link: a battery guides a semi-active or command missile all the way, an active one until its own seeker
    if (u && !u.dead && (sk === 'SARH' || sk === 'CMD' || ((sk === 'ARH' || sk === 'HTK') && !m.active)) && cam.z > 0.06) {
      const lost = m.lostLock || m.semiT > 0, bad = rain || clut;
      const n = 16, dx = (x - u.x) / n, dy = (y - u.y) / n, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      ctx.lineWidth = (bad ? 1.3 : 1) * px;
      ctx.strokeStyle = lost ? 'rgba(255,120,100,1)' : 'rgba(120,220,255,1)';
      if (lost) ctx.setLineDash([3 * px, 4 * px]);
      ctx.beginPath();
      const k = Math.floor(now * 9);
      for (let i = 0; i < n; i++) {
        // in rain or clutter the link drops out in pieces and shakes
        if (bad && hash(i, k, m.seed || m.t0 || 1) < (clut ? 0.45 : 0.35)) continue;
        const j0 = bad ? (hash(i, k, 2) - 0.5) * 2.4 * px : 0, j1 = bad ? (hash(i + 1, k, 2) - 0.5) * 2.4 * px : 0;
        ctx.moveTo(u.x + dx * i + nx * j0, u.y + dy * i + ny * j0); ctx.lineTo(u.x + dx * (i + 1) + nx * j1, u.y + dy * (i + 1) + ny * j1);
      }
      ctx.globalAlpha = lost ? 0.55 : bad ? 0.4 + 0.25 * hash(k, 1, 1) : 0.22; ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // a heat-seeker in rain or cloud: mist round it, and its seeker hunting for the heat
    if (sk === 'IR' && IC.icptHas(m, 'weather')) {
      for (let i = 0; i < 3; i++) { const ph = (now * 0.7 + i / 3) % 1; blob('mist', '200,206,214', x + Math.sin(i * 2.1 + now) * 6 * px, y + Math.cos(i * 1.7 + now) * 5 * px, (5 + 9 * ph) * px, 0.22 * (1 - ph)); }
      const a = m.a + 0.35 * Math.sin(now * 6.3 + (m.t0 || 0)), w = 0.28;
      ctx.strokeStyle = 'rgba(255,220,160,1)'; ctx.lineWidth = 0.9 * px; ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - w) * 16 * px, y + Math.sin(a - w) * 16 * px);
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + w) * 16 * px, y + Math.sin(a + w) * 16 * px);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}
/* a hostile track nobody is on yet because every battery in reach is busy: brackets, and a line to the battery */
function unanswered(S, t, v, px, now) {
  let W = waits.get(t);
  if (!W || lastNow - W.at > 0.3) { W = { at: lastNow, u: IC.icptUnanswered(S, t) }; waits.set(t, W); }
  const u = W.u; if (!u) return 0;
  const p = 0.55 + 0.45 * Math.sin(now * 7), r = 9 * px, c = 4 * px;
  ctx.strokeStyle = 'rgba(255,96,80,1)'; ctx.lineWidth = 1.6 * px; ctx.globalAlpha = 0.5 + 0.4 * p;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const X = v.x + sx * r, Y = v.y + sy * r;
    ctx.moveTo(X - sx * c, Y); ctx.lineTo(X, Y); ctx.lineTo(X, Y - sy * c);
  }
  ctx.stroke();
  if (cam.z > 0.08) {
    ctx.globalAlpha = 0.22; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 5 * px]);
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(v.x, v.y); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  return 1;
}

/* ---------- a miss, played out ----------
   A missile that missed for one of the reasons intercept.js names is drawn here instead of flying on and
   destroying itself: render-combat.js hands it over */
const PLAY = { manoeuvre: 1.6, speed: 1.3, clutter: 1.9, weather: 2.1, range: 2.4, energy: 2.4, spent: 2.6 };
IC.icptTakeGhost = function (S, V) {
  const m = V.m, e = m && m.end, cause = e && e.cause;
  if (!cause || !PLAY[cause] || !inView(V.hx, V.hy, 400)) return false;
  const t = m.target, tv = t && !t.dead && IC.trackView(S, t, VIEW);
  const sp = t ? U.hyp(t.vx || 0, t.vy || 0) : 0;
  const A = V.tr && V.tr.pts, n = A ? A.length : 0;
  let a = m.a || 0;
  if (n >= 8) { const dx = V.hx - A[n - 8], dy = V.hy - A[n - 7]; if (Math.abs(dx) + Math.abs(dy) > 1e-3) a = Math.atan2(dy, dx); }
  fx.push({ cause, ir: m.M && m.M.seeker === 'IR', htk: m.M && m.M.seeker === 'HTK', x: V.hx, y: V.hy, a, t: 0, life: PLAY[cause],
    tx: tv ? tv.x : V.hx, ty: tv ? tv.y : V.hy, ux: sp > 0.01 ? t.vx / sp : Math.cos(a), uy: sp > 0.01 ? t.vy / sp : Math.sin(a),
    side: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 10, pts: [] });
  if (fx.length > 60) fx.shift();
  return true;
};
/* the missile drawn at a point: a small hot dot */
function dot(x, y, px, a, hot) { blob('hot', '255,230,190', x, y, 4 * px, a * (hot ? 0.9 : 0.5)); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(245,250,255,1)'; ctx.beginPath(); ctx.arc(x, y, 1.4 * px, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
function trail(F, px, rgb, w) {
  const P = F.pts; if (P.length < 4) return;
  ctx.strokeStyle = `rgba(${rgb},1)`; ctx.lineWidth = w * px; ctx.lineCap = 'round';
  for (let i = 2; i < P.length; i += 2) { ctx.globalAlpha = 0.45 * i / P.length * (1 - F.t / F.life); ctx.beginPath(); ctx.moveTo(P[i - 2], P[i - 1]); ctx.lineTo(P[i], P[i + 1]); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
function play(F, px, now) {
  const k = F.t / F.life, ca = Math.cos(F.a), sa = Math.sin(F.a), nx = -sa, ny = ca;
  if (F.cause === 'manoeuvre') {
    // it overshoots, trying to turn back after the warhead that jinked: steering jets puff, then it destroys itself
    const turn = F.side * 1.1 * Math.min(1, k * 1.6), d = 46 * px * Math.min(1, k / 0.75);
    const x = F.x + Math.cos(F.a + turn * 0.5) * d, y = F.y + Math.sin(F.a + turn * 0.5) * d;
    F.pts.push(x, y); trail(F, px, '235,240,245', 1.6);
    if (k < 0.75) dot(x, y, px, 1, true);
    for (let i = 0; i < 4; i++) { const f = U.clamp(k * 4 - i * 0.4, 0, 1); if (f <= 0 || f >= 1) continue; const px0 = F.x + ca * i * 9 * px, py0 = F.y + sa * i * 9 * px; blob('puff', '235,240,250', px0 + nx * F.side * 6 * px * f, py0 + ny * F.side * 6 * px * f, (2 + 5 * f) * px, 0.6 * (1 - f)); }
    // the warhead's own sidestep: a bright flick where it jinked
    if (k < 0.35) { ctx.globalCompositeOperation = 'lighter'; blob('warm', '255,170,120', F.tx - nx * F.side * 7 * px, F.ty - ny * F.side * 7 * px, 9 * px, 0.7 * (1 - k / 0.35)); ctx.globalCompositeOperation = 'source-over'; }
    if (k > 0.75 && k < 0.9) { ctx.globalCompositeOperation = 'lighter'; blob('hot', '255,230,190', x, y, 10 * px * (k - 0.7) * 6, 0.8); ctx.globalCompositeOperation = 'source-over'; }
  } else if (F.cause === 'speed') {
    // the fuse fired a fraction late: the burst is behind the warhead, which flies on through its own fragments
    const bx = F.tx - F.ux * 14 * px, by = F.ty - F.uy * 14 * px;
    if (F.htk) {
      const s = 1 - k; ctx.strokeStyle = 'rgba(240,248,255,1)'; ctx.lineWidth = 1.6 * px; ctx.globalAlpha = 0.8 * s;
      ctx.beginPath(); ctx.moveTo(bx - ca * 40 * px * k, by - sa * 40 * px * k); ctx.lineTo(bx + ca * 60 * px * k, by + sa * 60 * px * k); ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = 'lighter';
      blob('hot', '255,226,170', bx, by, (6 + 22 * Math.sqrt(k)) * px, 0.9 * (1 - k));
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,214,150,1)'; ctx.lineWidth = 1 * px;
      for (let i = 0; i < 16; i++) {
        const a = F.a + (hash(i, 1, F.seed) - 0.5) * 1.6, r0 = 30 * px * k, r1 = r0 + (6 + 8 * hash(i, 2, F.seed)) * px;
        ctx.globalAlpha = 0.85 * (1 - k); ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r0, by + Math.sin(a) * r0); ctx.lineTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  } else if (F.cause === 'clutter') {
    // it lost the target against the ground's echo and flies into the ground short of it
    const f = Math.min(1, k / 0.4), x = F.x + ca * 30 * px * f, y = F.y + sa * 30 * px * f + 14 * px * f * f;
    if (f < 1) { F.pts.push(x, y); dot(x, y, px, 1, true); }
    trail(F, px, '220,225,230', 1.4);
    if (f >= 1) {
      const g = (k - 0.4) / 0.6;
      blob('dust', '170,150,120', x, y, (4 + 16 * Math.sqrt(g)) * px, 0.6 * (1 - g));
      if (g < 0.25) { ctx.globalCompositeOperation = 'lighter'; blob('warm', '255,190,120', x, y, 8 * px, 0.8 * (1 - g / 0.25)); ctx.globalCompositeOperation = 'source-over'; }
      ctx.strokeStyle = 'rgba(200,180,150,1)'; ctx.lineWidth = 1 * px; ctx.globalAlpha = 0.5 * (1 - g);
      ctx.beginPath(); ctx.ellipse(x, y, 18 * px * g, 9 * px * g, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
  } else if (F.cause === 'weather') {
    const turn = F.side * (F.ir ? 1.3 : 0.25) * k, d = 60 * px * k * (1 - k * 0.3);
    const x = F.x + Math.cos(F.a + turn) * d, y = F.y + Math.sin(F.a + turn) * d;
    F.pts.push(x, y); trail(F, px, '210,214,220', 1.3);
    if (F.ir) {
      // a heat-seeker that lost the heat in the murk: it wanders off and disappears into the cloud
      for (let i = 0; i < 4; i++) blob('mist', '196,202,210', x + Math.sin(i * 2.3 + F.seed) * 10 * px * k, y + Math.cos(i * 1.9 + F.seed) * 8 * px * k, (6 + 18 * k) * px, 0.35 * k * (1 - k * 0.6));
      dot(x, y, px, 1 - k, false);
    } else {
      // a radar round blinded by rain: it flies on, its light sputtering, and destroys itself
      if (hash(Math.floor(now * 14), 1, F.seed) > 0.4 && k < 0.85) dot(x, y, px, 0.9, true);
      if (k > 0.85) { ctx.globalCompositeOperation = 'lighter'; blob('hot', '255,230,190', x, y, 9 * px, 0.8 * (1 - (k - 0.85) / 0.15)); ctx.globalCompositeOperation = 'source-over'; }
    }
  } else {
    // range, energy, spent: too slow to fly on, it tumbles down and lands in a puff
    const f = Math.min(1, k / 0.8), d = 34 * px * (1 - (1 - f) * (1 - f)), drop = 38 * px * f * f;
    const x = F.x + ca * d, y = F.y + sa * d + drop;
    if (f < 1) {
      F.pts.push(x, y);
      const sp = now * 16 + F.seed, l = 3 * px;
      ctx.strokeStyle = 'rgba(235,240,245,1)'; ctx.lineWidth = 1.4 * px; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(sp) * l, y - Math.sin(sp) * l); ctx.lineTo(x + Math.cos(sp) * l, y + Math.sin(sp) * l); ctx.stroke(); ctx.globalAlpha = 1;
    }
    trail(F, px, '200,205,212', 1);
    if (f >= 1) { const g = (k - 0.8) / 0.2; blob('dust', '170,150,120', x, y, (3 + 9 * g) * px, 0.5 * (1 - g)); }
  }
}

/* ---------- the frame ---------- */
IC.drawIntercept = function (S, px, now, light) {
  ctx = RS.ctx;
  dtR = lastNow ? U.clamp(now - lastNow, 0, 0.1) : 0; lastNow = now;
  const film = IC.film && IC.film.clean;
  let nWait = 0;
  for (const t of S.threats) {
    if (t.dead || !t.det || t.d.civil) continue;
    const v = IC.trackView(S, t, VIEW); if (!v || !inView(v.x, v.y, 120)) continue;
    const hostile = v.aff === 'H' || v.aff === 'S' || v.aff === 'U';
    if (!hostile) continue;
    if (IC.icptLow(t) && cam.z > 0.12) clutter(S, t, v, px, now);
    if (jinking(t)) jink(S, t, v, px); else if (hist.has(t)) hist.delete(t);
    if (!BAL[t.d.cls] && IC.icptFast(t) < 0.999 && cam.z > 0.15) shock(t, v, px);
    if (!film && nWait < 24) nWait += unanswered(S, t, v, px, now);
  }
  for (const t of hist.keys()) if (t.dead) hist.delete(t);
  for (const t of waits.keys()) if (t.dead || !t.det) waits.delete(t);
  inFlight(S, px, now);
  for (let i = fx.length - 1; i >= 0; i--) {
    const F = fx[i]; F.t += dtR;
    if (F.t >= F.life) { fx.splice(i, 1); continue; }
    if (inView(F.x, F.y, 200)) play(F, px, now);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
};
// tests and the shot tools look at what is being played
IC.icptFx = fx;

})(window.IC);
