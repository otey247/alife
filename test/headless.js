// Headless run: node test/headless.js [ticks] [start] [preset]
const A = require('../engine.js');
const ticks = +process.argv[2] || 20000, start = process.argv[3] || 'ecosystem', preset = process.argv[4] || 'continents';
const w = new A.World({ seed: +process.argv[5] || 3, start, preset });
const t0 = Date.now();
const every = Math.max(1000, (ticks / 20) | 0);
for (let i = 0; i < ticks; i++) {
  w.step();
  if (w.tick % every === 0) {
    const h = w.history[w.history.length - 1];
    const m = k => A.toReal(A.GENES[A.G[k]], h.mean[A.G[k]]).toFixed(2);
    console.log(`t=${w.tick} pop=${h.pop} roles=${h.roles.join('/')} spp=${h.species} gen=${h.gen.toFixed(0)}/${h.maxGen} size=${m('size')} h=${m('height')} spd=${m('speed')} tox=${m('toxin')} arm=${m('armor')} aq=${m('aqua')} deaths=${JSON.stringify(w.deaths)}`);
  }
}
const dt = (Date.now() - t0) / 1000;
console.log(`${ticks} ticks in ${dt.toFixed(1)}s = ${(ticks / dt) | 0} tps; species records ${w.species.size}`);
const top = [...w.species.values()].filter(s => s.n > 0).sort((a, b) => b.n - a.n).slice(0, 12);
for (const s of top) console.log(`  ${s.name.padEnd(28)} n=${String(s.n).padEnd(5)} ${A.ROLES[s.role].padEnd(11)} gen=${s.gen} [${s.tags.join(', ')}]`);
console.log(w.events.slice(-8).map(e => e.t + ' ' + e.text).join('\n'));
