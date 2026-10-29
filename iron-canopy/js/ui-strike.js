/* Iron Canopy — the counter-strike table (brief 78), DOM: a page of the Air room where the player talks a strike over
   with Gen. Voss. Pick a sector on the compass, then what to hit there; she says what is known, what their defence
   is, what she would send and what she expects, and the packages she will and will not fly. The choice stays with
   the player: a package she refuses can still be ordered, at a cost to her trust. Odds and orders are strike.js. */
(function (IC) {
'use strict';
const U = IC.U;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => `${Math.round(v * 100)}%`;
const T = IC.strikeUI = { sec: null, grp: null, msg: '', insist: -1 };

// the compass, row by row: the eight sectors round our capital
const GRID = [['NW', 'N', 'NE'], ['W', null, 'E'], ['SW', 'S', 'SE']];
IC.strikePage = function (S) {
  const secs = IC.strikeSectors(S), by = {}; for (const s of secs) by[s.k] = s;
  const block = IC.strikeBlock(S);
  const face = IC.portrait ? `<div class="sk-face">${IC.portrait('CDS', 72)}</div>` : '';
  const voss = IC.ADVISORS.CDS.name, trust = IC.trustOf(S, 'CDS');
  const tw = IC.trustWord ? IC.trustWord(trust) : trust >= 65 ? 'trusts you' : trust >= 40 ? 'wary' : 'doubts you';
  let say = T.msg || (block ? block : T.sec ? '' : 'Where do you want to hit them? Pick a sector. I will tell you what we know is there.');
  // the compass
  const cell = k => {
    if (!k) return `<div class="sk-mid">${esc((IC.cap(S) || {}).name || 'Capital')}</div>`;
    const s = by[k];
    if (!s) return `<button class="sk-sec" disabled><b>${k}</b><small>nothing</small></button>`;
    const n = Object.values(s.g).reduce((a, g) => a + g.n, 0), kn = Object.values(s.g).reduce((a, g) => a + g.known, 0);
    return `<button class="sk-sec" data-act="strk" data-v="sec:${k}" aria-pressed="${T.sec === k}"><b>${k}</b><small>${n} launchers · ${kn} located</small></button>`;
  };
  const compass = `<div class="sk-compass">${GRID.map(r => r.map(cell).join('')).join('')}</div>`;
  let kinds = '', talk = '';
  if (T.sec && by[T.sec]) {
    const s = by[T.sec];
    kinds = `<div class="sk-kinds">${Object.entries(IC.WP_GRP).filter(([g]) => s.g[g]).map(([g, G]) => `<button class="btn" data-act="strk" data-v="grp:${g}" aria-pressed="${T.grp === g}">${esc(G.name)} <em>${s.g[g].n}${s.g[g].known ? ` · ${s.g[g].known} located` : ' · none located'}</em></button>`).join('')}</div>`;
    if (!T.grp) say = say || `The ${IC.wpSectorWord(T.sec)}. What do you want gone?`;
  }
  if (T.sec && T.grp && !block) {
    const t = IC.strikeTalk(S, T.sec, T.grp);
    say = T.msg || t.line;
    if (t.pk) talk = `<div class="sk-pkgs">${t.pk.map((p, i) => {
      const o = p.o, rec = i === t.rec;
      const go = p.ok ? `<button class="btn primary" data-act="strk" data-v="go:${i}">Order it</button>`
        : !p.enough ? `<button class="btn" disabled>${esc(p.why)}</button>`
        : t.canInsist ? `<button class="btn warn" data-act="strk" data-v="${T.insist === i ? 'force' : 'insist'}:${i}" title="She advises against it: her trust in you falls">${T.insist === i ? 'Yes, order it anyway' : 'Order it against her advice'}</button>`
        : `<button class="btn" disabled>She refuses</button>`;
      return `<div class="sk-pkg${rec ? ' rec' : ''}${p.ok ? '' : ' no'}"><h4>${esc(o.pkg.name)}${rec ? '<em>her advice</em>' : ''}</h4>
        <dl class="kv"><dt>Aircraft</dt><dd>${o.all} (${o.jets} with bombs)</dd><dt>Each one lost</dt><dd>${pct(o.loss)}</dd><dt>Expected lost</dt><dd>${o.lossJets.toFixed(1)}</dd><dt>Launchers destroyed</dt><dd>about ${o.kills.toFixed(1)} of ${o.n}</dd></dl>
        ${p.ok || !p.enough ? '' : `<p class="hint">${esc(p.why)}: she would not send it.</p>`}${go}</div>`;
    }).join('')}</div><p class="hint">Their air defence covering the target: ${t.pk[0].o.D.sam} launchers · their fighters within reach: ${t.pk[0].o.D.ftr}. An escort halves the danger from fighters; radar hunters halve it from their air defence. A jet destroys a launcher we have located ${pct(IC.STRIKE.kill)} of the time, one it has to hunt for ${pct(IC.STRIKE.blind)}.</p>`;
  }
  const X = S.strike || { cur: [], log: [] };
  const cur = X.cur.map(st => `<div class="li"><b>In the air: the ${esc(IC.wpSectorWord(st.sec))}</b><small>${st.out.map(f => esc(f.name)).join(', ')} · ${st.arrived} of ${st.out.length} flights over the target</small><span class="la">${st.out.map(f => `<button class="btn sm" data-act="strk" data-v="show:${f.id}">${esc(f.name)}</button>`).join('')}</span></div>`).join('');
  const log = X.log.filter(st => st.done).slice(0, 6).map(st => `<div class="li"><b>${esc(U.clock(st.done, S))} · the ${esc(IC.wpSectorWord(st.sec))}</b><small>${esc(st.text)}</small></div>`).join('');
  return `<div class="card wide sk"><div class="sk-head">${face}<div><h3>${esc(voss)}<em>Chief of Defence · ${esc(tw)}</em></h3><p class="sk-say">“${esc(say)}”</p></div></div>
    <div class="sk-body">${compass}<div class="sk-right">${kinds}${talk}</div></div></div>
    ${cur ? `<div class="card wide"><h3>Strikes in the air</h3><div class="list">${cur}</div></div>` : ''}
    <div class="card wide"><h3>Strike reports</h3>${log ? `<div class="list">${log}</div>` : '<p class="hint">No strikes yet. Destroyed launchers do not fire in their next raid; they answer strikes on their soil with a retaliation strike.</p>'}</div>`;
};
IC.strikeAct = function (S, v) {
  const [k, a] = String(v).split(':');
  T.msg = '';
  if (k === 'sec') { T.sec = a; T.grp = null; T.insist = -1; }
  else if (k === 'grp') { T.grp = a; T.insist = -1; }
  else if (k === 'insist') { T.insist = +a; T.msg = 'If you order that, I will fly it. But I want it written down that I advised against it.'; }
  else if (k === 'go' || k === 'force') {
    const r = IC.strikeOrder(S, T.sec, T.grp, +a, k === 'force');
    T.insist = -1;
    if (!r.ok) T.msg = r.why;
    else { T.msg = `They are on their way. Watch them cross the border.`; IC.sfx && IC.sfx.ui('ok'); }
  } else if (k === 'show') {
    const ac = S.air.find(x => x.id === a);
    if (ac) { IC.ui.openRoom(null); S.sel = { kind: 'air', ref: ac }; IC.flyTo(ac.x, ac.y, Math.max(IC.cam.z, 0.6)); }
  }
};

})(window.IC);
