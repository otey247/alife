const A = require('../engine.js');
const sd = +process.argv[2], n = +process.argv[3] || 30000, mode = process.argv[4] || '';
Object.assign(A.C, JSON.parse(process.env.CC || '{}')); const w = new A.World({ seed: sd });
if (mode.includes('nohunt')) w.schedule = w.schedule.filter(e => e.t < 6000);
let huT = 0; let out = 'seed ' + sd + ' ' + mode + ':';
for (let i = 0; i < n; i++) { w.step(); if (w.tick % 3000 === 0) { const h = w.history[w.history.length - 1]; const m = w.orgs.filter(o => o.alive && o.mobile && o.herbEff > 0.3); const hu = w.orgs.filter(o => o.alive && o.mobile && o.carnEff > 0.3).length; huT += hu > 0 ? 1 : 0;
  out += ` ${h.roles[0]}/${m.length}/${hu}`; } }
console.log(out, "| carnivore-present samples", huT);
