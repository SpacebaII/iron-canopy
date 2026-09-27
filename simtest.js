const IC = require('./headless.js');
const U = IC.U;
const mode = process.argv[2] || 'campaign';
const hours = +(process.argv[3] || 2);
const seed = +(process.argv[4] || 42);
const t0 = Date.now();
const S = IC.newGame({ seed, mode });
console.log('newGame', Date.now() - t0, 'ms', 'units', S.units.length, 'roster', S.roster.length, 'infra', S.infra.length);
S.paused = false;
const t1 = Date.now();
let lastLog = 0;
const ev = {};
IC.on((S2, type) => { ev[type] = (ev[type] || 0) + 1; });
for (let i = 0; i < hours * 3600 / 0.25 && !S.over; i++) {
  IC.step(S, 0.25);
  if (Date.now() - lastLog > 4000) { lastLog = Date.now(); console.log('  at', U.clock(S.time), 'threats', S.threats.length, 'civ', S.threats.filter(t => t.d.civil).length, 'air', S.air.length, 'plan', S.enemy.plan ? S.enemy.plan.kind + '/' + S.enemy.plan.phase : '-'); }
}
console.log('ran', hours, 'h in', Date.now() - t1, 'ms', U.clock(S.time), 'over:', S.over);
console.log('stats', JSON.stringify(S.stats));
console.log('budget', S.budget.toFixed(0), 'will', S.enemy.will.toFixed(1), 'morale', IC.nationalMorale(S).toFixed(1), 'weather', S.weather.kind);
console.log('events', JSON.stringify(ev));
console.log('enemy ops:', S.enemy.ops.slice(-12).map(o => `${o.type}:${o.launched}/${o.done}/${o.hits}`).join(' '));
console.log('enemy method', JSON.stringify(S.enemy.method), 'objW', JSON.stringify(S.enemy.objW));
console.log('bases', IC.bases(S).map(b => `${b.name} rwy:${IC.baseStatus(S, b).runway} hp ${Math.round(b.hp)}/${b.max} works ${b.works.length}`).join(' | '));
console.log('roster', S.roster.map(r => `${r.name}:${r.st}${r.slot ? '' : '(open)'}`).join(' '));
console.log('units', S.units.map(u => `${u.name}:${u.state}${u.radarOn ? '*' : ''} f${Math.round(u.fat)} ${u.mags.map(m => m.mag + '/' + m.store).join(',')} ${u.why || ''}`).join(' | '));
console.log('depots', IC.depots(S).map(d => d.name + ' ' + IC.STOCK_KEYS.filter(k => d.inv[k] >= 1).map(k => k + Math.floor(d.inv[k])).join(' ')).join(' | '));
console.log('cities', IC.cities(S).map(c => `${c.name} ${Math.round(c.hp)}/${Math.round(c.max)} m${Math.round(c.morale)}`).join(' '));
console.log('aff counts', JSON.stringify(S.threats.reduce((o, t) => { if (t.det) o[t.aff] = (o[t.aff] || 0) + 1; return o; }, {})));
console.log('suggestions', (S.camp.objs || []).map(o => o.text).join(' / '));
console.log('--- last logs');
console.log(S.logs.slice(0, 30).map(l => U.hhmm(l.t) + ' ' + l.tag + ' ' + l.msg).join('\n'));
