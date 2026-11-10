const A = require('../engine.js');
const sd = +process.argv[2], n = +process.argv[3] || 30000;
const w = new A.World({ seed: sd, preset: process.argv[4] || 'continents' });
let out = 'seed ' + sd + ':';
for (let i = 0; i < n; i++) { w.step(); if (w.tick % 5000 === 0) { const h = w.history[w.history.length - 1]; out += ' ' + h.roles.join('/'); } }
let spp = 0; for (const s of w.species.values()) if (s.n >= 5) spp++;
console.log(out, '| spp>=5:', spp, 'records', w.species.size, 'gen', w.maxGen);
