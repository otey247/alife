const A = require('../engine.js');
Object.assign(A.C, JSON.parse(process.env.CC || '{}'));
const sd = +process.argv[2], n = +process.argv[3];
const w = new A.World({ seed: sd, params: { immigration: 0 } });
let kills = 0, hb = 0, hd = { starved: 0, eaten: 0, old: 0, hazard: 0 };
const H = o => o.mobile && o.carnEff > 0.3, Gz = o => o.mobile && !H(o) && o.herbEff > 0.3;
w.on('death', (o, c, by) => { if (c === 'eaten' && by && H(by) && o.mobile) kills++; if (H(o)) hd[c]++; }); w.on('birth', c => { if (H(c)) hb++; });
let hsum = 0, k = 0;
for (let i = 0; i < n; i++) { w.step();
  if (w.tick % 250 === 0) { hsum += w.orgs.filter(o => o.alive && H(o)).length; k++; }
  if (w.tick % 10000 === 0) {
    const g = w.orgs.filter(o => o.alive && Gz(o)), h = w.orgs.filter(o => o.alive && H(o));
    const a = (arr, f) => arr.length ? (arr.reduce((s, o) => s + f(o), 0) / arr.length).toFixed(2) : '-';
    console.log(w.tick, 'G', g.length, 'size', a(g, o => o.size), 'B', a(g, o => o.B), 'spd', a(g, o => o.speed), 'thr', a(g, o => o.thrust), 'cover', a(g, o => o.cover), 'arm', a(g, o => o.armor), 'tox', a(g, o => o.toxin), 'aqua', a(g, o => o.aqua), 'dorm', a(g, o => o.p.dorm),
      '| H avg', (hsum / k).toFixed(1), 'kills/H/1k', (kills / Math.max(1, hsum / k) / 10).toFixed(1), 'births', hb, JSON.stringify(hd), 'size', a(h, o => o.size), 'spd', a(h, o => o.speed), 'sense', a(h, o => o.p.sense), 'egg', a(h, o => o.p.egg), 'dorm', a(h, o => o.p.dorm), 'carn', a(h, o => o.carnEff), 'therm', a(h, o => o.therm), 'rest', a(h, o => o.p.rest), 'long', a(h, o => o.p.long), 'mut', a(h, o => o.p.mut), 'mature', a(h, o => o.p.mature), 'eggsH', w.banks[1].filter(e => e.genome[A.G.carn] > 0.5).length, 'Gsense', a(g, o => o.p.sense), 'Gegg', a(g, o => o.p.egg));
    kills = hb = hsum = k = 0; hd = { starved: 0, eaten: 0, old: 0, hazard: 0 };
  } }
