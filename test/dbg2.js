const A = require('../engine.js');
const w = new A.World({ seed: +process.argv[3]||7 });
let d = {starved:0,eaten:0,old:0,hazard:0}, births=0, kills=0;
const isH=o=>o.mobile&&o.carnEff>0.15; const every=+process.argv[4]||250;
w.on('death',(o,c)=>{ if(isH(o)) d[c]++; if(c==='eaten'&&o.mobile) kills++; });
w.on('birth',(c)=>{ if(isH(c)) births++; });
const n=+process.argv[2]||8000;
for(let i=0;i<n;i++){ w.step(); if(w.tick%every===0){
  const m=w.orgs.filter(o=>o.alive&&isH(o)); const pr=w.orgs.filter(o=>o.alive&&o.mobile&&!isH(o));
  const avg=(a,f)=>a.length?(a.reduce((s,o)=>s+f(o),0)/a.length).toFixed(2):'-';
  console.log(`t=${w.tick} hunters=${m.length} births=${births} d=${JSON.stringify(d)} preyKilled=${kills} fill=${avg(m,o=>o.B/o.full)} mouth=${avg(m,o=>o.mouth>0?1:0)} thr=${avg(m,o=>o.thrust)} meat=${avg(m,o=>o.inMeat)} | prey=${pr.length} psize=${avg(pr,o=>o.size)} pB=${avg(pr,o=>o.B)} pspd=${avg(pr,o=>o.speed)} prgb=${avg(pr,o=>o.genome[0])},${avg(pr,o=>o.genome[1])},${avg(pr,o=>o.genome[2])}`);
  d={starved:0,eaten:0,old:0,hazard:0}; births=0; kills=0;
}}
