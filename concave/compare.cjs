// Regenerate legacy baselines; compare against saved v2 runs with identical data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('./engine.js'),P=require('./phantom.js');
const engineSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'engine.js'))).digest('hex');
const summary=[];
for(const [views,rotation] of [[4,0],[8,0],[8,22.5],[16,0]]) {
  const current=JSON.parse(fs.readFileSync(path.join(__dirname,`result-${views}-${rotation}.json`),'utf8'));
  assert.equal(current.protocol.engineSha256,engineSha256,'Regenerate saved v2 runs first');
  const data=P.makeData(P.shape(rotation*Math.PI/180),views);
  assert.deepEqual(current.data,data);
  const start=performance.now(),legacy=C.searchLegacy(data),seconds=(performance.now()-start)/1000;
  const evaluation=P.evaluate(current.truth,legacy);
  const fields=(result,evaluation,elapsedSeconds)=>({status:result.status,candidates:result.candidates.length,
    totalEvaluations:result.totalEvaluations??result.candidates.length,elapsedSeconds,
    residual:result.best?.score??null,gridIoU:evaluation?.gridIoU??null,
    sampledBoundaryDistance:evaluation?.sampledBoundaryDistance??null,
    trueCutConvexityDefectArea:evaluation?.trueCutConvexityDefectArea??null,
    outerContainmentViolation:evaluation?.outerContainmentViolation??null,
    trueCutConvexityPass:evaluation?.trueCutConvexityPass??null});
  const row={views,rotation,legacy:fields(legacy,evaluation,seconds),adaptive:fields(current.result,current.evaluation,current.protocol.elapsedSeconds)};
  summary.push(row);console.log(row);
}
fs.writeFileSync(path.join(__dirname,'search-comparison.json'),JSON.stringify({date:'2026-09-29',engineSha256,
  warning:'Development cases, not a held-out benchmark. Single-run timings are descriptive, not a speed claim. Both methods receive identical total data; true cuts never enter search.',cases:summary},null,2));
