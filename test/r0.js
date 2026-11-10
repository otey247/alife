// Predator fitness benchmark: inject N founder hunters into an established world and follow the cohort.
const A = require('../engine.js');
Object.assign(A.C, JSON.parse(process.env.CC || '{}'));
const H = JSON.parse(process.env.HG || '{}'); Object.assign(A.FOUNDERS.hunter.genes, H);
const sd = +process.argv[2] || 7, N = +process.argv[3] || 100, T0 = +process.argv[4] || 12000;
const w = new A.World({ seed: sd, params: { immigration: 1 } });
w.schedule = w.schedule.filter(e => e.t < 6000);
w.run(T0); w.P.immigration = 0;
const prey0 = w.orgs.filter(o => o.alive && o.mobile && o.herbEff > 0.3).length;
const sp = w.seedScatter('hunter', N, o => o.mobile && o.herbEff > 0.3);
const isH = o => o.mobile && o.carnEff > 0.3;
const dead = { 0: [], 1: [], 2: [] }; let kills = 0, meatSum = 0; const eat = {};
w.on('death', (o, c, by) => { if (isH(o) && o.gen <= 2) dead[o.gen].push({ c, age: o.age, kids: o.kids, meat: o.inMeat }); if (c === 'eaten' && by && isH(by) && o.mobile) kills++; if (c === 'eaten' && isH(o) && by) { const k = by.sp === o.sp ? 'kin' : isH(by) ? 'otherHunter' : by.mobile ? 'grazer' : 'sessile'; eat[k] = (eat[k] || 0) + 1; } });
let line = `seed ${sd} prey0 ${prey0}:`;
for (let i = 0; i < 4000; i++) { w.step(); if ((i + 1) % 500 === 0) { const h = w.orgs.filter(o => o.alive && isH(o)); line += ` ${h.length}`; } }
const st = g => { const d = dead[g]; if (!d.length) return 'n0'; const m = f => (d.reduce((s, x) => s + f(x), 0) / d.length).toFixed(2); const c = {}; for (const x of d) c[x.c] = (c[x.c] || 0) + 1; return `n${d.length} kids ${m(x => x.kids)} age ${m(x => x.age)} meat ${m(x => x.meat)} ${JSON.stringify(c)}`; };
const prey1 = w.orgs.filter(o => o.alive && o.mobile && o.herbEff > 0.3 && !isH(o)).length;
console.log(line, '| kills', kills, 'prey end', prey1, 'eatenBy', JSON.stringify(eat), 'preyB', (w.orgs.filter(o=>o.alive&&o.mobile&&!isH(o)).reduce((s,o)=>s+o.B,0)/Math.max(1,prey1)).toFixed(2), '\n  gen0', st(0), '\n  gen1', st(1), '\n  gen2', st(2));
