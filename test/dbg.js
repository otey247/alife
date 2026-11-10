const A = require('../engine.js');
const w = new A.World({ seed: +process.argv[3]||3 }); const every=+process.argv[4]||1000;
let d = {starved:0,eaten:0,old:0,hazard:0}, ages=0, nd=0, births=0;
w.on('death',(o,c)=>{ if(o.mobile){d[c]++; ages+=o.age; nd++;} });
w.on('birth',(c)=>{ if(c.mobile) births++; });
const n=+process.argv[2]||12000;
for(let i=0;i<n;i++){ w.step(); if(w.tick%every===0){
  const m=w.orgs.filter(o=>o.alive&&o.mobile); const pl=w.orgs.filter(o=>o.alive&&!o.mobile);
  const avg=(a,f)=>a.length?(a.reduce((s,o)=>s+f(o),0)/a.length).toFixed(2):'-';
  console.log(`t=${w.tick} mob=${m.length} births=${births} deaths=${JSON.stringify(d)} meanAgeDeath=${nd?(ages/nd|0):0} fill=${avg(m,o=>o.B/o.full)} size=${avg(m,o=>o.size)} spd=${avg(m,o=>o.speed)} herb=${avg(m,o=>o.herbEff)} carn=${avg(m,o=>o.carnEff)} mouth=${avg(m,o=>o.mouth>0?1:0)} thr=${avg(m,o=>o.thrust)} hab=${avg(m,o=>o.hab)} therm=${avg(m,o=>o.therm)} | plants=${pl.length} psize=${avg(pl,o=>o.size)} pB=${avg(pl,o=>o.B)} rgb=${avg(pl,o=>o.genome[0])},${avg(pl,o=>o.genome[1])},${avg(pl,o=>o.genome[2])} arm=${avg(pl,o=>o.armor)} landplants=${pl.filter(o=>!o.water).length}`);
  d={starved:0,eaten:0,old:0,hazard:0}; ages=0; nd=0; births=0;
}}
