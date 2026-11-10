// predator persistence experiment: node test/pred.js seed ticks immigration [CC json]
const A = require('../engine.js');
Object.assign(A.C, JSON.parse(process.env.CC || '{}'));
const sd = +process.argv[2], n = +process.argv[3] || 80000, imm = +process.argv[4];
const w = new A.World({ seed: sd, params: { immigration: imm } });
let gp = 0, hp = 0, tot = 0, pres = 0, k = 0, kills = 0, out = `seed ${sd} imm ${imm}:`, sumH = 0;
w.on('death', (o, c, by) => { if (c === 'eaten' && o.mobile && by && by.mobile && by.carnEff > 0.3) kills++; });
const off = +process.argv[5] || -1; const t0 = Date.now();
for (let i = 0; i < n; i++) {
  w.step(); if (w.tick === off) w.P.immigration = 0;
  if (w.tick % 250 === 0) { k++; let hu = 0, gr = 0; for (const o of w.orgs) if (o.alive && o.mobile) { if (o.carnEff > 0.3) hu++; else if (o.herbEff > 0.3) gr++; } if (hu > 0) pres++; sumH += hu; if (gr > 0) gp++; tot++; if (hu > 0) hp++;
    if (w.tick % 10000 === 0) { out += ` [${Math.round(pres / k * 100)}% avgH ${(sumH / k).toFixed(1)} gr ${gr} kills ${kills}]`; pres = k = kills = sumH = 0; } }
}
const h = w.orgs.filter(o => o.alive && o.mobile && o.carnEff > 0.3);
const avg = f => h.length ? (h.reduce((s, o) => s + f(o), 0) / h.length).toFixed(2) : '-';
console.log(out, `| overall grazers ${Math.round(gp/tot*100)}% hunters ${Math.round(hp/tot*100)}% | tps ${Math.round(n/((Date.now()-t0)/1000))} | ${((Date.now() - t0) / 1000) | 0}s gen ${w.maxGen} | bank ${w.banks[0].length}/${w.banks[1].length} hunters now ${h.length} dorm ${avg(o => o.p.dorm)} rest ${avg(o => o.p.rest)} size ${avg(o => o.size)} spd ${avg(o => o.speed)} sense ${avg(o => o.p.sense)} egg ${avg(o => o.p.egg)} long ${avg(o => o.p.long)} herb ${avg(o => o.herbEff)}`);
