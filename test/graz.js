const A = require('../engine.js');
Object.assign(A.C, JSON.parse(process.env.CC || '{}'));
const sd = +process.argv[2], n = +process.argv[3], imm = +process.argv[4], off = +process.argv[5] || -1, from = +process.argv[6] || 0, every = +process.argv[7] || 2500;
const w = new A.World({ seed: sd, params: { immigration: imm } });
let d = { starved: 0, eaten: 0, old: 0, hazard: 0 }, b = 0, juv = 0;
const G = o => o.mobile && o.herbEff > 0.3 && o.carnEff <= 0.3;
w.on('death', (o, c) => { if (G(o)) { d[c]++; if (o.age < 100) juv++; } }); w.on('birth', c => { if (G(c)) b++; });
for (let i = 0; i < n; i++) {
  w.step(); if (w.tick === off) w.P.immigration = 0;
  if (w.tick >= from && w.tick % every === 0) {
    const m = w.orgs.filter(o => o.alive && G(o)), pl = w.orgs.filter(o => o.alive && !o.mobile && !o.water && o.photoEff > 0.3);
    const a = (arr, f) => arr.length ? (arr.reduce((s, o) => s + f(o), 0) / arr.length).toFixed(2) : '-';
    const reach = m.length ? m.reduce((s, o) => s + o.rad, 0) / m.length * A.C.REACH : 0;
    const out = pl.filter(o => o.height * Math.sqrt(Math.min(o.B, o.size)) > reach).length;
    const stub = pl.filter(o => o.B <= 0.47 * o.peak).length;
    console.log(w.tick, 'graz', m.length, 'b', b, JSON.stringify(d), 'juv', juv, 'fill', a(m, o => o.B / o.full), 'size', a(m, o => o.size), 'spd', a(m, o => o.speed), 'herb', a(m, o => o.herbEff), 'sense', a(m, o => o.p.sense), 'thr', a(m, o => o.thrust), 'mouth', a(m, o => o.mouth > 0 ? 1 : 0),
      '| land', pl.length, 'pSize', a(pl, o => o.size), 'pB', a(pl, o => o.B), 'h', a(pl, o => o.height), 'arm', a(pl, o => o.armor), 'tox', a(pl, o => o.toxin), 'outOfReach', out, 'stubs', stub, 'rgb', a(pl, o => o.genome[0]), a(pl, o => o.genome[1]), a(pl, o => o.genome[2]), 'grgb', a(m, o => o.genome[0]), a(m, o => o.genome[1]), a(m, o => o.genome[2]));
    d = { starved: 0, eaten: 0, old: 0, hazard: 0 }; b = 0; juv = 0;
  }
}
