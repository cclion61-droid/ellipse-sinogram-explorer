const fs=require('node:fs'),path=require('node:path');
const C=require('./engine.js'),P=require('./phantom.js'),M=require('./models.js');
const rows=[];
for(const c of M.cases()) {
  const data=P.makeData(c.truth,8),begin=performance.now();
  const result=C.search(data);
  const evaluation=P.evaluate(c.truth,result);
  rows.push({id:c.id,seconds:(performance.now()-begin)/1000,totalEvaluations:result.totalEvaluations,
    status:result.status,cut:result.best?{phi:result.best.phi,offset:result.best.offset}:null,
    residual:result.best?.score??null,gridIoU:evaluation?.gridIoU??null,
    trueCutConvexityPass:evaluation?.trueCutConvexityPass??null,
    outerContainmentViolation:evaluation?.outerContainmentViolation??null});
  console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(path.join(__dirname,'optimization-baselines.json'),JSON.stringify({version:2,
  note:'Prior adaptive cut search on the same six noiseless total sinograms; not a held-out test.',cases:rows},null,2));
