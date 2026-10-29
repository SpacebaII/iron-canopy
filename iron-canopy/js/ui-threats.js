/* Iron Canopy — the enemy's weapons in front of the player (DOM). The first time a version of a weapon is seen, a card
   stops the game: what it is, how fast, how high and how big, what it is good and bad at, and what stops it, with
   its flight drawn against an airliner's for scale. A ballistic salvo in the air is a banner at the top of the
   screen until it lands. The Intel room lists every version met so far and whether the enemy still trusts it.
   Data from arms.js; the map's side is render-threat.js. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- what a version is, in numbers a player can compare ---------- */
const kmh = d => d.move === 'bal' ? (d.vAvg || 12) * 360 : d.cls === 'hgv' ? (d.spd || 20) * 360 : (d.spd || 0) * 360;
const topKm = d => d.move === 'bal' ? Math.max(18, (d.apexK || 0.025) * 3000) : d.cls === 'hgv' ? 40 : d.alt || 0;
const pips = (v, steps) => { let k = 1; for (const s of steps) if (v >= s) k++; return Math.min(5, k); };
IC.armsStats = function (d, F) {
  const hard = (d.move === 'bal' || d.cls === 'hgv' ? 4 : 1) + (d.evasive ? 1 : 0) + (d.hop ? 1 : 0) + (d.boost ? 1 : 0) + (d.spd > 2.5 ? 1 : 0);
  const low = (d.alt || 1) < 0.1 && d.move !== 'bal';
  const size = F && F.size ? `${F.size[0]} m long · ${F.size[1] >= 1000 ? `${+(F.size[1] / 1000).toFixed(F.size[1] < 10000 ? 1 : 0)} t` : `${F.size[1]} kg`}` : '';
  const alt = topKm(d);
  return [
    { k: 'Speed', v: `${Math.round(kmh(d) / 10) * 10 >= 1000 ? (Math.round(kmh(d) / 100) * 100).toLocaleString('en') : Math.round(kmh(d) / 10) * 10} km/h`, p: pips(kmh(d), [250, 600, 1500, 5000]) },
    { k: d.move === 'bal' ? 'Arc' : 'Flies at', v: alt >= 1 ? `${Math.round(alt)} km up` : `${Math.round(alt * 1000)} m up`, p: 0 },
    { k: 'Warhead', v: !d.dmg ? 'none' : d.dmg < 20 ? 'light' : d.dmg < 50 ? 'medium' : d.dmg < 100 ? 'heavy' : 'very heavy', p: d.dmg ? pips(d.dmg, [20, 50, 100, 140]) : 0 },
    { k: 'Hard to see', v: d.rcs <= 0.03 ? 'tiny on radar' : d.rcs <= 0.1 ? 'small on radar' : d.rcs <= 1 ? 'medium' : 'large', p: Math.min(5, pips(1 / Math.max(0.005, d.rcs), [0.3, 2, 11, 40]) + (low ? 1 : 0)) },
    { k: 'Hard to stop', v: d.move === 'bal' || d.cls === 'hgv' ? 'BMD only' : d.evasive || d.hop ? 'evades' : 'steady', p: Math.min(5, hard) },
    { k: 'Size', v: size, p: 0 }
  ];
};
// what the version does that the numbers do not say
const SPECIAL = d => [d.crash && `About ${Math.round(d.crash * 100)}% come down on their own on the way.`, d.hop && `Jumps between treetops and ${d.hop} km.`, d.retgt && 'Follows a target that moves; takes another when its own is gone.',
  d.cep && `Lands anywhere within ${U.km(d.cep * 1.2)} of its aim.`, d.boost && 'Its booster shows on radar as a second warhead.', d.endur && `Stays up ${Math.round(d.endur / 60)} minutes.`, d.blind && 'Still hits a radar that has gone silent.'].filter(Boolean);

/* the flight against height, to scale, with an airliner at 11 km: a drone is a line on the ground under it, a
   ballistic missile's arc towers over it */
function profile(cv, d) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, padL = 52, padB = 8;
  g.clearRect(0, 0, W, H);
  const top0 = topKm(d), Hmax = Math.max(14, top0 * 1.15), hy = km => H - padB - Math.max(0, km) / Hmax * (H - padB - 10);
  const step = [2, 5, 10, 25, 50, 100, 200].find(s => Hmax / s <= 4) || 500;
  g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'right';
  for (let km = step; km < Hmax; km += step) {
    const y = hy(km); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(padL, y); g.lineTo(W, y); g.stroke();
    g.fillStyle = 'rgba(200,220,235,0.55)'; g.fillText(`${km} km`, padL - 6, y + 4);
  }
  // ground and an airliner for scale
  g.fillStyle = 'rgba(120,150,110,0.35)'; g.fillRect(padL, hy(0), W - padL, H);
  const ay = hy(11); g.fillStyle = 'rgba(127,232,176,0.85)'; g.textAlign = 'left'; g.fillText('✈ airliner, 11 km', padL + 6, ay - 5);
  g.strokeStyle = 'rgba(127,232,176,0.4)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(padL, ay); g.lineTo(W, ay); g.stroke(); g.setLineDash([]);
  const top = top0, N = 120, X = f => padL + 6 + f * (W - padL - 14);
  const at = f => {
    if (d.move === 'bal') return top * 4 * f * (1 - f);
    if (d.cls === 'hgv') return f < 0.25 ? 40 * Math.sin(f / 0.25 * Math.PI / 2) + 0.01 : f > 0.85 ? 40 * (1 - f) / 0.15 + 0.01 : 40;
    if (d.glide) return Math.max(0.02, top * (1 - f));
    if (d.dive) return f > 0.85 ? Math.max(0.02, top * (1 - f) / 0.15) : f < 0.08 ? top * f / 0.08 : top;
    if (d.hop) return 0.05 + (d.hop - 0.05) * (Math.sin(f * 40) > 0 ? 1 : 0);
    const a = Math.max(0.02, d.alt || 0.04);
    return f < 0.05 ? a * f / 0.05 + 0.01 : f > 0.96 ? a * (1 - f) / 0.04 + 0.01 : a * (1 + 0.15 * Math.sin(f * 30));
  };
  g.strokeStyle = '#ff6b5e'; g.lineWidth = 2.2; g.shadowColor = 'rgba(255,90,70,0.7)'; g.shadowBlur = 6;
  g.beginPath(); for (let i = 0; i <= N; i++) { const f = i / N, y = hy(at(f)); i ? g.lineTo(X(f), y) : g.moveTo(X(f), y); } g.stroke();
  g.shadowBlur = 0; g.fillStyle = '#ffb3a8'; g.beginPath(); g.arc(X(1), hy(0.01), 4, 0, 7); g.fill();
}
function portrait(cv, type) {
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  if (IC.drawThreatSymbol) IC.drawThreatSymbol(g, type, cv.width / 2, cv.height / 2 + 4, cv.width / 26);
}

/* ---------- the card ---------- */
function cardHTML(S, key, up) {
  const v = IC.armsVer(key), F = IC.ARMS[v.type], d = IC.ARMS_D[key], was = up && IC.armsVer(up);
  const st = IC.armsStats(d, F), sp = SPECIAL(d);
  const tiers = F.tiers.length > 1 ? `<div class="thr-tiers">${F.tiers.map(t => `<span class="${t.key === key ? 'on' : S.arms && S.arms.seen[t.key] ? 'seen' : ''}" title="${esc(t.nick)}">${['I', 'II', 'III'][t.n - 1]}</span>`).join('')}</div>` : '';
  const f = S.arms && S.arms.f[v.type];
  return `<div class="thr-head"><canvas class="thr-pic" width="104" height="80" data-type="${v.type}"></canvas><div>
      <small>${was ? `New version · was the ${esc(was.nick)}` : 'New enemy weapon'}</small><h2>${esc(v.nick)}</h2><p class="thr-fam">${esc(cap(F.fam.replace(/s$/, '')))}${F.tiers.length > 1 ? ` · version ${v.n} of ${F.tiers.length}` : ''}</p>${tiers}</div></div>
    <p class="thr-sum">${esc(v.sum)}</p>${was && v.chg ? `<p class="thr-chg"><b>What changed:</b> ${esc(v.chg)}</p>` : ''}
    <div class="thr-stats">${st.filter(s => s.v).map(s => `<div><span>${esc(s.k)}</span><b>${esc(s.v)}</b>${s.p ? `<i>${'<em class="on"></em>'.repeat(s.p)}${'<em></em>'.repeat(5 - s.p)}</i>` : ''}</div>`).join('')}</div>
     <canvas class="thr-prof" width="560" height="140" data-key="${key}"></canvas>
    ${sp.length ? `<p class="thr-sp">${sp.map(esc).join(' ')}</p>` : ''}
    <div class="thr-cols"><div class="good"><h4>Strengths</h4><ul>${v.good.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div><div class="bad"><h4>Weaknesses</h4><ul>${v.bad.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div>
    <p class="thr-stop"><b>What stops it:</b> ${esc(v.stop)}</p>
    ${f && f.out ? '<p class="thr-out">They have lost faith in it: most of the last ones never got through, so they send fewer.</p>' : ''}
    <div class="thr-foot"><button class="btn primary" data-thr="close">Got it</button></div>`;
}
const U2 = { shown: 0, cur: null, paused: false, salvoN: 0, salvoKeys: new Set() };
function show(S, key, up, fromQueue) {
  let el = $('thrcard');
  if (!el) { el = document.createElement('div'); el.id = 'thrcard'; el.className = 'thrcard'; el.setAttribute('role', 'dialog'); (document.getElementById('app') || document.body).appendChild(el); }
  el.innerHTML = cardHTML(S, key, up); el.hidden = false; U2.cur = key;
  for (const cv of el.querySelectorAll('canvas.thr-pic')) portrait(cv, cv.dataset.type);
  for (const cv of el.querySelectorAll('canvas.thr-prof')) profile(cv, IC.ARMS_D[cv.dataset.key]);
  // a weapon met in a fight stops the clock while the card is read (not in the Academy, which has its own words)
  if (fromQueue && !S.paused && S.mode !== 'academy') { S.paused = true; S.skip = false; if (S.wait && IC.waitStop) IC.waitStop(S, 'A new enemy weapon.'); U2.paused = true; }
  IC.sfx && IC.sfx.ui && IC.sfx.ui('chapter');
}
function close() {
  const el = $('thrcard'); if (!el || el.hidden) return;
  el.hidden = true; U2.cur = null;
  if (U2.paused && IC.S) IC.S.paused = false;
  U2.paused = false;
}
IC.armsShowCard = (S, key) => show(S, key, null, false);

/* ---------- the salvo banner ---------- */
function banner(S) {
  let el = $('salvo');
  const G = S && S.threats && !S.free ? IC.salvos(S) : [];
  if (!G.length) { if (el) el.hidden = true; U2.salvoN = 0; return; }
  if (!el) { el = document.createElement('button'); el.id = 'salvo'; el.className = 'salvo'; el.dataset.thr = 'salvo'; (document.getElementById('app') || document.body).appendChild(el); }
  const g = G[0], n = G.reduce((s, x) => s + x.n, 0), word = g.hgv === g.n ? 'hypersonic glider' : 'ballistic missile';
  const html = `<b>${g.n} ${word}${g.n > 1 ? 's' : ''}</b><span>falling on ${esc(g.at)} · impact in ${U.dur(g.t0)}</span>${G.length > 1 ? `<small>${G.length - 1} more salvo${G.length > 2 ? 's' : ''}, ${n - g.n} more warheads</small>` : ''}`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = false; el.classList.toggle('last', g.t0 < 30); el.dataset.x = g.x; el.dataset.y = g.y;
  // a louder alarm each time the salvos in the air grow
  if (n > U2.salvoN && n >= 2) IC.sfx && IC.sfx.alarm && IC.sfx.alarm();
  U2.salvoN = n;
}

/* ---------- the Intel room: every version met, and whether they still trust it ---------- */
IC.armsCodex = function (S) {
  const a = S.arms; if (!a) return '';
  const keys = Object.keys(a.seen).sort((p, q) => a.seen[p] - a.seen[q]);
  const rows = keys.map(k => {
    const v = IC.armsVer(k); if (!v) return '';
    const f = a.f[v.type], cur = IC.armsKey(S, v.type) === k;
    const st = !cur ? `replaced by the ${esc(IC.armsVer(IC.armsKey(S, v.type)).nick)}` : f && f.out ? 'out of favour: they send few' : f && f.fav < 0.8 ? 'used less' : f && f.fav > 1.15 ? 'favoured: it works for them' : 'in use';
    const n = f ? `${f.down} shot down · ${f.hit} got through${f.crash ? ` · ${f.crash} crashed` : ''}` : '';
    return `<button class="li" data-thr="card" data-v="${k}"><b>${esc(v.nick)}</b><small>${esc(IC.ARMS[v.type].fam.replace(/s$/, ''))}${IC.ARMS[v.type].tiers.length > 1 ? ` · version ${v.n}` : ''} · ${st}${n ? ' · ' + n : ''}</small></button>`;
  }).join('');
  return `<div class="card"><h3>Their weapons<em>${keys.length} met · click one for its card</em></h3>${rows ? `<div class="list">${rows}</div>` : '<p class="hint">None seen yet. Each new weapon gets a card the first time our radars identify it.</p>'}</div>`;
};

if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-thr]'); if (!b) return;
    const S = IC.S, k = b.dataset.thr;
    if (k === 'close') close();
    else if (k === 'card' && S) show(S, b.dataset.v, null, false);
    else if (k === 'salvo' && IC.centerOn) IC.centerOn(+b.dataset.x, +b.dataset.y);
    e.stopPropagation();
  });
  document.addEventListener('keydown', e => { if (U2.cur && (e.key === 'Escape' || e.key === 'Enter')) { close(); e.preventDefault(); e.stopPropagation(); } }, true);
  // the cards wait for the start screen and any room to close; the banner follows the salvos
  let lastS = null;
  setInterval(() => {
    const S = IC.S;
    if (S !== lastS) { lastS = S; U2.shown = S && S.arms ? S.arms.cards.length : 0; close(); }
    if (!S) return;
    banner(S);
    const st = $('start');
    if (U2.cur || (st && !st.hidden) || (IC.ui && IC.ui.room) || !S.arms) return;
    if (U2.shown < S.arms.cards.length) { const c = S.arms.cards[U2.shown++]; show(S, c.key, c.up, true); }
  }, 250);
}

})(window.IC);
