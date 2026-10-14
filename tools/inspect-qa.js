/* Inspector run (functional QA): every kind of thing the player can select, in a Quick war that has been fought
   for a while by the scripted commander (qwplayer.js), in the Sandbox and in a Career that has grown for a few
   years (careerplayer.js is Node-only, so the Career is the network preset); each panel and each of its tabs is
   opened and read. Fails like the smoke run: page errors, and "undefined", "NaN" or "[object Object]" on screen.
     node tools/inspect-qa.js [--shots] [--save=file.json]
   --save loads a saved game exported from the page (Saved games, Export: a save written in Node is refused, its map
   built a hair differently) and
   reads the panels of its airports, their parts, aircraft, deals and the rooms instead.
   (the rest of this comment is the smoke run's, whose page helpers this shares)
   Smoke run: the real game in headless Chromium, every mode played for a little while as a player would, with real
   clicks and keys. Fails on any page error, and on "undefined", "NaN" or "[object Object]" anywhere on screen.
   Needs Playwright, which is not a project dependency:
     npm i --no-save playwright        (and npx playwright install chromium, unless a Chromium is already installed)
   node tools/smoke.js [--shots]       --shots saves a picture of each step in shots/smoke/
   What it plays: the start screen's pages; a Career (founding the national airport and laying its runway with the
   mouse, every room, the menu, a save, quitting and Continue); a Quick war into its first raid; every Academy lesson
   for a minute; the Test range; the Sandbox. About three minutes. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const SHOTS = process.argv.includes('--shots');
// (web fonts come from Google: a sandbox without them, or with a proxy that refuses them, is not the game's fault)
const IGNORE = /fonts\.(googleapis|gstatic)\.com|ERR_CERT|ERR_TOO_MANY_RETRIES|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|net::ERR_FAILED/;
const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object \w+\]/;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) {
    const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
    if (!fs.existsSync(alt)) throw e;
    browser = await chromium.launch(Object.assign({ executablePath: alt }, opt));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const problems = [];
  let step = 'loading';
  page.on('pageerror', e => problems.push(`${step}: page error: ${e.message} ${(e.stack || '').split('\n').slice(1, 3).map(l => l.trim()).join(' ')}`));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text() + ' ' + ((m.location() || {}).url || ''))) problems.push(`${step}: console error: ${m.text()}`); });
  page.on('requestfailed', r => { if (!IGNORE.test(r.url() + ' ' + (r.failure() || {}).errorText) && !/three/.test(r.url())) problems.push(`${step}: request failed: ${r.url()}`); });
  // three.js (the replay window only) comes from cdnjs; where that is blocked, a local copy serves (npm i --no-save three@0.160.0)
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));

  const ev = js => page.evaluate(js);
  const wait = ms => page.waitForTimeout(ms);
  const ready = () => page.waitForFunction(() => window.IC && IC.S && !(IC.building && IC.building()) && IC.loading !== true, null, { timeout: 180000 });
  let n = 0, seen = 0;
  const look = async name => {
    step = name;
    const txt = await ev(`[...document.querySelectorAll('#app *')].filter(e => e.offsetParent !== null && e.childElementCount === 0).map(e => e.textContent).join('\\n') + '\\n' + [...document.querySelectorAll('[title]')].map(e => e.title).join('\\n')`);
    for (const line of txt.split('\n')) if (BAD_TEXT.test(line)) problems.push(`${name}: on screen: ${JSON.stringify(line.trim().slice(0, 140))}`);
    if (SHOTS) { fs.mkdirSync(path.resolve(__dirname, '../shots/smoke'), { recursive: true }); await page.screenshot({ path: path.resolve(__dirname, `../shots/smoke/${String(++n).padStart(2, '0')}-${name}.png`) }); }
    console.log(`  ${problems.length > seen ? 'PROBLEM' : 'ok'}  ${name}`); for (const p of problems.slice(seen)) console.log(`       ${p}`); seen = problems.length;
  };
  // the page closes whatever is on top of the map: a chapter card, the tips
  const clear = async () => {
    for (let i = 0; i < 10; i++) {
      const hint = await page.$('#hints button[data-act=hintOk]');
      const cine = await ev(`!document.getElementById('cine').hidden`);
      if (!hint && !cine) break;
      if (cine) await page.click('#cine').catch(() => {}); else await hint.click().catch(() => {});
      await wait(200);
    }
  };
  // game hours of play, stepped in the page (the frames keep drawing between the slices)
  const run = async (hours, dt) => { for (let h = 0; h < hours * 4; h++) { await ev(`(() => { const S = IC.S, t1 = S.time + 900; while (S.time < t1 && !S.over) IC.step(S, ${dt || 1}); })()`); await wait(30); } };
  const toScreen = async (x, y) => { const b = await (await page.$('#map')).boundingBox(), q = await ev(`IC.toScreen(${x}, ${y})`); return { x: b.x + q.x, y: b.y + q.y }; };
  const clickWorld = async (x, y) => { const p = await toScreen(x, y); await page.mouse.move(p.x, p.y, { steps: 6 }); await page.mouse.click(p.x, p.y); await wait(250); };


  // select something, read the panel, then open each of its tabs and read them too
  const panel = async (name, js) => {
    const ok = await ev(`(() => { const s = (${js}); if (!s) return false; IC.select(s); return true; })()`);
    if (!ok) { console.log(`  --  ${name} (nothing to select)`); return; }
    await wait(250); await look(name);
    const tabs = await ev(`[...document.querySelectorAll('#insp [data-act=aptTab], #insp [data-act=tab]')].map(b => b.dataset.v)`);
    for (const v of [...new Set(tabs)]) { const b = await page.$(`#insp [data-v="${v}"][data-act]`); if (b) { await b.click().catch(() => {}); await wait(250); await look(`${name}-${v}`); } }
  };
  const t0 = Date.now();
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await ready(); await wait(500);
  await page.addScriptTag({ path: path.resolve(__dirname, '../qwplayer.js') });

  const saveArg = (process.argv.find(a => a.startsWith('--save=')) || '').slice(7);
  if (saveArg) {
    console.log(`Saved game ${saveArg}`);
    await page.click('#st-main button[data-v=campaign]'); await wait(500); await ready();
    await ev(`(() => { const S2 = IC.loadSave(${JSON.stringify(fs.readFileSync(saveArg, 'utf8'))}); IC.adopt(S2); })()`); await wait(1500); await clear();
    await run(0.5, 1); await clear(); await look('save');
    const aps = await ev(`IC.bases(IC.S).filter(b => b.parts && b.parts.length).map(b => b.id)`);
    for (const id of aps) {
      await ev(`(() => { const b = IC.S.byId['${id}']; IC.cam.z = 3; IC.centerOn(b.x, b.y); })()`);
      await panel(`apt-${id}`, `{ kind: 'infra', ref: IC.S.byId['${id}'] }`);
      for (const k of await ev(`[...new Set(IC.S.byId['${id}'].parts.map(p => p.kind))]`)) await panel(`apt-${id}-${k}`, `(() => { const ap = IC.S.byId['${id}']; return { kind: 'apart', ref: ap.parts.find(p => p.kind === '${k}'), ap }; })()`);
    }
    for (let i = 0; i < 4; i++) await panel(`tail-${i}`, `IC.S.av && IC.S.av.tails[${i * 5}] && { kind: 'tail', ref: IC.S.av.tails[${i * 5}] }`);
    await panel('flight', `(() => { const t = IC.S.threats.find(t => !t.dead && t.d.civil); return t && { kind: 'flight', ref: t }; })()`);
    await panel('fix', `IC.S.asp && IC.S.asp.fixes && IC.S.asp.fixes[0] && { kind: 'fix', ref: IC.S.asp.fixes[0] }`);
    await panel('city', `{ kind: 'infra', ref: IC.cap(IC.S) }`);
    await panel('factory', `(() => { const r = IC.S.infra.find(i => i.kind === 'factory'); return r && { kind: 'infra', ref: r }; })()`);
    for (const k of ['v', 'c', 'e', 'j', 'r', '?']) { await page.keyboard.press('Escape'); await page.keyboard.press(k); await wait(400); await look(`save-room-${k === '?' ? 'guide' : k}`); }
    await browser.close();
    console.log(problems.length ? `\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}` : `\nInspector run clean in ${Math.round((Date.now() - t0) / 1000)} s.`);
    process.exit(problems.length ? 1 : 0);
  }

  console.log('Quick war, after a day of war');
  await page.click('#st-main button[data-v=campaign]'); await wait(500); await ready(); await wait(1000); await clear();
  for (let h = 0; h < 30; h++) { await ev(`(() => { const S = IC.S, t1 = S.time + 3600; let i = 0; while (S.time < t1 && !S.over) { IC.step(S, 1); if (i++ % 60 === 0) commander(S); } })()`); if (await ev(`IC.S.threats.some(t => !t.dead && !t.d.civil)`) && h > 20) break; }
  await wait(500); await clear(); await look('qw');
  const types = await ev(`[...new Set(IC.S.units.filter(u => !u.dead).map(u => u.type))]`);
  for (const t of types) await panel(`unit-${t}`, `{ kind: 'unit', ref: IC.S.units.find(u => !u.dead && u.type === '${t}') }`);
  await panel('group', `null`); await ev(`(() => { const u = IC.S.units.filter(u => !u.dead).slice(0, 3); IC.select({ kind: 'unit', ref: u[0] }); IC.select({ kind: 'unit', ref: u[1] }, true); IC.select({ kind: 'unit', ref: u[2] }, true); })()`); await wait(250); await look('group');
  for (let i = 0; i < 6; i++) { const t = await ev(`(() => { const t = IC.cycleTrack(IC.S, 1); if (t) IC.ui.jump(t, 'track'); return t ? (t.type || t.cls || 'track') : null; })()`); if (!t) break; await wait(250); await look(`track-${i}-${t}`); }
  await panel('air', `IC.S.air.find(a => !a.dead) && { kind: 'air', ref: IC.S.air.find(a => !a.dead) }`);
  await panel('airbase', `{ kind: 'infra', ref: IC.mainBase(IC.S) }`);
  await panel('city', `{ kind: 'infra', ref: IC.cap(IC.S) }`);
  for (const k of ['power', 'factory', 'depot', 'bridge', 'port', 'airport']) await panel(`infra-${k}`, `(() => { const r = IC.S.infra.find(i => i.kind === '${k}'); return r && { kind: 'infra', ref: r }; })()`);
  await panel('convoy', `IC.S.vehicles.find(v => !v.dead) && { kind: 'veh', ref: IC.S.vehicles.find(v => !v.dead) }`);
  await panel('site', `(() => { const s = IC.S.esites.find(s => s.pk >= 1); return s && { kind: 'site', ref: s }; })()`);
  await panel('tel', `(() => { const s = IC.S.tels.find(s => s.kt != null); return s && { kind: 'tel', ref: s }; })()`);
  for (const k of ['a', 'l', 'i', 'r', 'v', 'e', 'j']) { await page.keyboard.press('Escape'); await page.keyboard.press(k); await wait(400); await look(`qw-room-${k}`); }
  await page.keyboard.press('Escape');

  console.log('Sandbox');
  await ev(`IC.begin('test')`); await wait(300); await ready(); await wait(800); await clear(); await look('sbx');
  for (const [act, v] of [['sbxAt', 'base'], ['sbxLaunch'], ['sbxRaid'], ['sbxAt', 'cap']]) { await ev(`IC.sandboxAct(IC.S, '${act}', ${v ? `'${v}'` : 'null'})`); await run(0.25, 1); await look(`sbx-${act}${v ? '-' + v : ''}`); }
  for (const r of await ev(`IC.SBX_RULES.map(r => r.k)`)) { await ev(`IC.sandboxAct(IC.S, 'sbxRule', '${r}')`); await run(0.25, 1); await look(`sbx-rule-${r}`); }
  for (const raid of await ev(`Object.keys(IC.SBX_RAIDS)`)) { await ev(`IC.sandboxForm(IC.S, 'raid', '${raid}'); IC.sandboxAct(IC.S, 'sbxRaid')`); await run(0.5, 1); await look(`sbx-raid-${raid}`); }
  await ev(`IC.sandboxClear(IC.S); IC.sandboxRepair(IC.S)`); await run(0.1, 1); await look('sbx-repaired');

  console.log('Career, three airports');
  await ev(`IC.begin('story')`); await wait(300); await ready(); await wait(800); await clear();
  const net = await ev(`!!IC.S.story.cap && !!IC.S.byId[IC.S.story.cap]`);
  if (net) {
    await run(6, 1); await clear();
    await panel('apt', `{ kind: 'infra', ref: IC.S.byId[IC.S.story.cap] }`);
    await panel('apt-part', `(() => { const ap = IC.S.byId[IC.S.story.cap], p = ap.parts.find(p => p.kind === 'terminal') || ap.parts[0]; return p && { kind: 'apart', ref: p, ap }; })()`);
    await panel('tail', `IC.S.av && IC.S.av.tails[0] && { kind: 'tail', ref: IC.S.av.tails[0] }`);
  } else console.log('  --  the Career starts with no airport: its panels are in the smoke run');
  for (const k of ['v', 'c', 'e', 'j', '?']) { await page.keyboard.press('Escape'); await page.keyboard.press(k); await wait(400); await look(`career-room-${k === '?' ? 'guide' : k}`); }

  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}` : `\nInspector run clean in ${Math.round((Date.now() - t0) / 1000)} s.`);
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
