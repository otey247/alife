const A = require('../engine.js');
const sd = +process.argv[2], n = +process.argv[3] || 30000;
const w = new A.World({ seed: sd, preset: process.argv[4] || 'continents' });
let out = 'seed ' + sd + ':', huT = 0, k = 0, kills = 0;
w.on('death', (o, c, by) => { if (c === 'eaten' && o.mobile && by && by.mobile && by.carnEff > 0.3) kills++; });
for (let i = 0; i < n; i++) { w.step(); if (w.tick % 250 === 0) { k++; let hu = 0, gr = 0; for (const o of w.orgs) if (o.alive && o.mobile) { if (o.carnEff > 0.3) hu++; else if (o.herbEff > 0.3) gr++; } if (hu > 0) huT++;
  if (w.tick % 4000 === 0) out += ` ${w.history[w.history.length - 1].roles[0]}/${gr}/${hu}`; } }
let spp = 0; for (const s of w.species.values()) if (s.n >= 5) spp++;
console.log(out, '| carnivores present', Math.round(huT / k * 100) + '% of time, predator kills', kills, '| spp', spp, 'gen', w.maxGen);
