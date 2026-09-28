/* Iron Canopy — saved games in the browser: slots in IndexedDB (localStorage when it is missing), the autosave,
   Continue, export and import as a file, the loading screen, and the lists of saved games on the start screen and
   in the Settings room. Making and reading a save is save.js; this file only stores, lists and shows them. Saves
   stay in this browser: nothing is sent anywhere. */
(function (IC) {
'use strict';
const U = IC.U, $ = id => document.getElementById(id), esc = U.esc;

IC.AUTOSAVE = { every: 600, realGap: 60, keep: 3 };   // game seconds between autosaves, real seconds at least, slots kept
const AUTO_MODES = { story: 1, campaign: 1, sandbox: 1 };

/* ---------- storage: meta (what the list shows) and data (the save, gzipped where the browser can) ---------- */
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise(res => {
    try {
      const r = indexedDB.open('iron-canopy-saves', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('data'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbP;
}
const done = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('The browser refused to store the save.')); });
async function pack(text) {
  try { if (typeof CompressionStream !== 'undefined') return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); } catch (e) { /* stored plain */ }
  return text;
}
async function unpack(v) {
  if (typeof v === 'string') return v;
  const blob = v instanceof Blob ? v : new Blob([v]);
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return await blob.text();
}
const LS = {
  metas() { try { return JSON.parse(localStorage.getItem('ic-saves') || '[]'); } catch (e) { return []; } },
  setMetas(L) { localStorage.setItem('ic-saves', JSON.stringify(L)); }
};
const saves = IC.saves = {
  list: [], note: '', noteBad: false, loaded: false,
  async refresh() {
    let L = [];
    try {
      const d = await db();
      if (d) L = await done(d.transaction('meta').objectStore('meta').getAll());
      else L = LS.metas();
    } catch (e) { L = LS.metas(); }
    saves.list = L.sort((a, b) => b.date - a.date); saves.loaded = true;
    changed();
    return saves.list;
  },
  async put(meta, text) {
    const d = await db();
    if (d) {
      const blob = await pack(text);
      meta.stored = blob.size != null ? blob.size : blob.length;
      const t = d.transaction(['meta', 'data'], 'readwrite');
      t.objectStore('data').put(blob, meta.id); t.objectStore('meta').put(meta);
      await txDone(t);
    } else {
      localStorage.setItem('ic-save:' + meta.id, text);
      meta.stored = text.length;
      LS.setMetas(LS.metas().filter(m => m.id !== meta.id).concat([meta]));
    }
    await saves.refresh();
  },
  async get(id) {
    const d = await db();
    const v = d ? await done(d.transaction('data').objectStore('data').get(id)) : localStorage.getItem('ic-save:' + id);
    if (v == null) throw new Error('This save is missing from the browser’s storage.');
    return unpack(v);
  },
  async del(id) {
    try {
      const d = await db();
      if (d) { const t = d.transaction(['meta', 'data'], 'readwrite'); t.objectStore('data').delete(id); t.objectStore('meta').delete(id); await txDone(t); }
      else { localStorage.removeItem('ic-save:' + id); LS.setMetas(LS.metas().filter(m => m.id !== id)); }
    } catch (e) { say('Could not delete it: ' + e.message, true); }
    await saves.refresh();
  }
};
const say = (text, bad) => { saves.note = text; saves.noteBad = !!bad; saves.noteT = Date.now(); changed(); };
const why = e => /quota/i.test(String(e && (e.name + e.message))) ? 'the browser’s storage for this page is full. Delete old saves, or export this one to a file.' : (e && e.message) || 'the browser refused.';

/* ---------- saving ---------- */
IC.saveName = S => IC.saveMeta(S).what;
function make(S, name) {
  const cam = IC.cam;
  const data = IC.saveGame(S, { name, view: { x: cam.x + cam.vw / cam.z / 2, y: cam.y + cam.vh / cam.z / 2, z: cam.z } });   // the centre of the view
  return { data, text: JSON.stringify(data) };
}
/* a named save in a new slot, or over an existing one (id) */
IC.saveNow = async function (S, name, id) {
  let made;
  try { made = make(S, name || IC.saveName(S)); } catch (e) { say('Could not save: ' + e.message, true); return false; }
  const meta = Object.assign({}, made.data.meta, { id: id || 'm' + Date.now().toString(36), auto: false, size: made.text.length, seed: made.data.seed, v: made.data.v });
  try { await saves.put(meta, made.text); } catch (e) { say('Could not save: ' + why(e), true); return false; }
  say(`Saved: ${meta.name}.`);
  IC.toast && IC.toast(S, 'info', 'SAVED', `${meta.name}. It is kept in this browser.`);
  return true;
};
/* the autosave: its own slots, the oldest of the last three replaced */
let lastAuto = 0;
const autoAt = new WeakMap();
IC.autosave = function (S) {
  if (!S || !AUTO_MODES[S.mode] || S.over) return Promise.resolve(false);
  let made;
  try { made = make(S, 'Autosave'); } catch (e) { return Promise.resolve(false); }
  lastAuto = performance.now(); autoAt.set(S, S.time);
  const autos = saves.list.filter(m => m.auto);
  let id = 'auto1';
  if (autos.length < IC.AUTOSAVE.keep) { for (let i = 1; i <= IC.AUTOSAVE.keep; i++) if (!autos.some(m => m.id === 'auto' + i)) { id = 'auto' + i; break; } }
  else id = autos.sort((a, b) => a.date - b.date)[0].id;
  const meta = Object.assign({}, made.data.meta, { id, auto: true, name: 'Autosave', size: made.text.length, seed: made.data.seed, v: made.data.v });
  return saves.put(meta, made.text).then(() => true, e => { say('The autosave failed: ' + why(e), true); return false; });
};
/* every 10 game minutes, and not more than once a minute in real time (at 32× that is every 32 game minutes) */
IC.autosaveTick = function (S) {
  if (!S || !AUTO_MODES[S.mode] || S.over || S.paused || !$('start').hidden || IC.loading) return;
  if (!autoAt.has(S)) { autoAt.set(S, S.time); return; }
  if (S.time - autoAt.get(S) >= IC.AUTOSAVE.every && performance.now() - lastAuto > IC.AUTOSAVE.realGap * 1000) IC.autosave(S);
};

/* ---------- loading, with a loading screen while the world regenerates ---------- */
IC.loading = false;
function showLoading(meta) {
  $('loading').hidden = false; $('ldErr').hidden = true; $('ldBarBox').hidden = false;
  $('ldName').textContent = meta ? meta.name : 'Saved game';
  $('ldWhat').textContent = meta ? line(Object.assign({}, meta, { name: meta.what })) : '';
  setBar(0, 'Reading the save');
}
function setBar(f, text) { $('ldBar').style.width = `${Math.round(f * 100)}%`; $('ldStep').textContent = `${text}…`; }
function ldError(text) {
  IC.loading = false;
  $('loading').hidden = false; $('ldBarBox').hidden = true; $('ldStep').textContent = '';
  $('ldErr').hidden = false; $('ldErrText').textContent = text;
}
function run(data) {
  const bad = IC.saveProblem(data); if (bad) return ldError(bad);
  IC.loading = true;
  const g = IC.loadSteps(data);
  const next = () => requestAnimationFrame(() => setTimeout(step, 0));
  const step = () => {
    let r;
    try { r = g.next(); } catch (e) { console.error(e); return ldError(`This save could not be loaded: ${e.message}`); }
    if (!r.done) { setBar(r.value[0], r.value[1]); return next(); }
    IC.loading = false; $('loading').hidden = true;
    IC.adopt(r.value, data.meta && data.meta.view);
    autoAt.set(r.value, r.value.time);
    IC.toast(r.value, 'info', 'LOADED', `${data.meta ? data.meta.name : 'Saved game'}. Paused: press Space to go on.`);
  };
  next();
}
IC.loadFrom = async function (id) {
  const meta = saves.list.find(m => m.id === id);
  showLoading(meta);
  // the game being played is kept as the autosave before another one replaces it
  if (IC.S && $('start').hidden) await IC.autosave(IC.S);
  let data;
  try { data = JSON.parse(await saves.get(id)); } catch (e) { return ldError(`This save could not be read: ${e.message}`); }
  run(data);
};

/* ---------- files ---------- */
async function exportSave(id) {
  const meta = saves.list.find(m => m.id === id);
  try {
    const text = await saves.get(id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `iron-canopy-${(meta ? meta.name : id).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say(`Exported ${meta ? meta.name : 'the save'} as a file. Import it on the Saved games page to play it here or in another browser.`);
  } catch (e) { say('Could not export it: ' + e.message, true); }
}
function importSave() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,.gz,application/json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    let data, text;
    try { text = await unpack(f); data = JSON.parse(text); } catch (e) { return say(`${f.name} is not a save file this game can read.`, true); }
    const bad = IC.saveProblem(data); if (bad) return say(`${f.name}: ${bad}`, true);
    const meta = Object.assign({ what: '', day: 0, clock: '' }, data.meta, { id: 'm' + Date.now().toString(36), auto: false, name: (data.meta && data.meta.name && data.meta.name !== 'Autosave' ? data.meta.name : f.name.replace(/\.(json|gz)$/i, '')), size: text.length, seed: data.seed, v: data.v, imported: Date.now() });
    try { await saves.put(meta, text); say(`Imported ${meta.name}. Load it from the list.`); } catch (e) { say('Could not import it: ' + why(e), true); }
  };
  inp.click();
}

/* ---------- the lists ---------- */
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const kb = n => n > 1e6 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
let delAsk = null;
const line = m => [m.name !== m.what && m.what, m.cal ? `${m.cal}, ${m.clock}` : `Day ${m.day}, ${m.clock}`, m.budget != null && `${U.money(m.budget)} in hand`].filter(Boolean).join(' · ');
function rows(inGame) {
  if (!saves.loaded) return '<p class="hint">Reading the saved games…</p>';
  if (!saves.list.length) return `<p class="hint">No saved games yet. ${inGame ? 'Save this one with the button above, or wait for the autosave (every 10 game minutes).' : 'Games save themselves every 10 game minutes and when you quit to the menu.'}</p>`;
  return `<div class="saves">${saves.list.map(m => `<div class="saverow${m.auto ? ' auto' : ''}">
    <div class="sv-txt"><b>${esc(m.name)}</b><span>${esc(line(m))}</span><small>Saved ${ago(m.date)} · ${kb(m.stored || m.size)}${m.imported ? ' · imported' : ''}</small></div>
    <div class="sv-acts"><button class="btn" data-act="saveLoad" data-v="${esc(m.id)}">Load</button><button class="btn sm" data-act="saveExport" data-v="${esc(m.id)}" title="Download this save as a file">Export</button><button class="btn sm ${delAsk === m.id ? 'warn' : 'ghost'}" data-act="saveDel" data-v="${esc(m.id)}">${delAsk === m.id ? 'Delete it?' : 'Delete'}</button></div>
  </div>`).join('')}</div>`;
}
const noteHTML = () => saves.note && Date.now() - saves.noteT < 20000 ? `<p class="svnote${saves.noteBad ? ' bad' : ''}">${esc(saves.note)}</p>` : '';
/* the start screen's Saved games page */
IC.savesPage = function () {
  const el = $('stSaves'); if (!el) return;
  el.innerHTML = `<div class="card wide">${noteHTML()}${rows(false)}<div class="acts"><button class="btn" data-act="saveImport">Import a save file</button></div>
    <p class="hint">Saves are kept in this browser only. Export one to keep a copy or to play it in another browser. The last three autosaves are kept.</p></div>`;
};
/* the Settings room's Game card */
IC.savesCardHTML = function (S) {
  const can = !!S && !S.over;
  return `<div class="card"><h3>Saved games<em>kept in this browser</em></h3>${noteHTML()}
    <div class="acts">${can ? `<button class="act" data-act="saveNow">Save the game</button>` : ''}<button class="btn" data-act="saveImport">Import a save file</button></div>
    ${rows(true)}
    <p class="hint">The game saves itself every 10 game minutes, in the last three autosave slots, and when you quit to the menu.</p>
    <div class="acts"><button class="act warn" data-act="restart">Quit to the main menu</button></div></div>`;
};
/* Continue: the newest save, on the start screen */
function continueBtn() {
  const b = $('stContinue'); if (!b) return;
  const m = saves.list[0];
  b.hidden = !m;
  if (m) { $('stContName').textContent = m.name === 'Autosave' ? m.what : m.name; $('stContWhat').textContent = `${m.auto ? 'Autosave · ' : ''}${line(Object.assign({}, m, { name: m.what }))} · saved ${ago(m.date)}`; }
}
function changed() {
  continueBtn();
  if (IC.ui && IC.ui.stPage === 'saves' && !$('start').hidden) IC.savesPage();
  if (IC.ui && IC.ui.room === 'settings' && IC.S) IC.ui.refresh(true);
}

/* ---------- actions (main.js hands every data-act here first; true when it was ours) ---------- */
IC.savesAct = function (S, a, v) {
  switch (a) {
    case 'saveNow': case 'saveQuick': IC.saveNow(S).then(ok => { if (a === 'saveQuick' && ok) IC.ui.toggleMenu(false); }); return true;
    case 'saveLoad': delAsk = null; IC.loadFrom(v); return true;
    case 'continue': if (saves.list[0]) IC.loadFrom(saves.list[0].id); return true;
    case 'saveExport': exportSave(v); return true;
    case 'saveImport': importSave(); return true;
    case 'saveDel': if (delAsk !== v) { delAsk = v; changed(); return true; } delAsk = null; saves.del(v).then(() => say('Deleted.')); return true;
    case 'ldBack': $('loading').hidden = true; return true;
    case 'restart': IC.autosave(S); IC.showStart(); return true;
  }
  return false;
};

saves.refresh();

})(window.IC);
