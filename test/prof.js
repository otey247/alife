const A = require('../engine.js');
const w = new A.World({ seed: 3 });
const T = {};
for (const s of w.systems) { const f = s.fn; T[s.name] = 0; s.fn = (x) => { const t = process.hrtime.bigint(); f(x); T[s.name] += Number(process.hrtime.bigint() - t) / 1e6; }; }
const n = +process.argv[2] || 3000; const t0 = Date.now(); w.run(n);
console.log('pop', w.orgs.length, 'tps', (n / ((Date.now() - t0) / 1000)) | 0, 'births', w.births, 'species', w.species.size);
for (const k in T) console.log(k.padEnd(14), (T[k] / n).toFixed(3), 'ms/tick');
