const A = require('../engine.js');
const w = new A.World({ seed: 7, params: { immigration: 0 } });
w.run(+process.argv[2] || 30000);
const T = {};
for (const s of w.systems) { const f = s.fn; T[s.name] = 0; s.fn = (x) => { const t = process.hrtime.bigint(); f(x); T[s.name] += Number(process.hrtime.bigint() - t) / 1e6; }; }
const n = 5000, t0 = Date.now(); const b0 = w.births; w.run(n);
console.log('pop', w.orgs.length, 'mobile', w.nMobile, 'tps', (n / ((Date.now() - t0) / 1000)) | 0, 'births/tick', ((w.births - b0) / n).toFixed(1));
for (const k in T) if (T[k] / n > 0.01) console.log(k.padEnd(14), (T[k] / n).toFixed(3), 'ms/tick');
