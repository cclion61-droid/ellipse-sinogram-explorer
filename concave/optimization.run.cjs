const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./engine.js'),P=require('./phantom.js'),O=require('./optimization.js'),M=require('./models.js');
const selected=new Set(process.argv.slice(2));
const cases=M.cases().filter(c=>!selected.size||selected.has(c.id));
const results=[];
for(const c of cases) {
  const data=P.makeData(c.truth,8),begin=performance.now();
  const result=O.optimize(data,{},progress=>{
    if(progress.tried%240===0)console.log(c.id,progress);
  });
  const elapsedSeconds=(performance.now()-begin)/1000;
  const evaluation=P.evaluate(c.truth,result);
  const compact={version:result.version,status:result.status,config:result.config,
    candidateCount:result.candidates.length,
    candidates:result.candidates.filter(row=>row.status==='compatible'),
    counts:result.counts,minimumResidual:result.minimumResidual,
    fidelityWinner:result.fidelityWinner,admissibleCount:result.admissibleCount,
    best:result.best?{phi:result.best.phi,offset:result.best.offset,
      score:result.best.score,perimeter:result.best.perimeter,
      output:result.best.output}:null,
    guarantee:result.guarantee};
  const report={id:c.id,label:c.label,model:c.model,data,truth:c.truth,result:compact,evaluation,elapsedSeconds};
  results.push(report);
  console.log(JSON.stringify({id:c.id,elapsedSeconds,counts:result.counts,minimumResidual:result.minimumResidual,
    admissibleCount:result.admissibleCount,cut:result.best?{phi:result.best.phi,offset:result.best.offset,
      residual:result.best.score,perimeter:result.best.perimeter}:null,
    evaluation:evaluation?{gridIoU:evaluation.gridIoU,trueCutConvexityPass:evaluation.trueCutConvexityPass,
      outerContainmentViolation:evaluation.outerContainmentViolation}:null}));
}
const sha256=files=>crypto.createHash('sha256').update(files.map(f=>fs.readFileSync(path.join(__dirname,f))).join('\n')).digest('hex');
const destination=path.join(__dirname,'optimization-results.json');
const old=fs.existsSync(destination)?JSON.parse(fs.readFileSync(destination,'utf8')):null;
const combined=selected.size?[...(old?.cases||[]).filter(c=>!selected.has(c.id)),...results]:results;
const order=new Map(M.cases().map((c,i)=>[c.id,i]));combined.sort((a,b)=>order.get(a.id)-order.get(b.id));
fs.writeFileSync(destination,JSON.stringify({date:'2026-09-29',algorithmSha256:sha256(['engine.js','optimization.js']),
  protocol:'Noiseless binary union, eight angles, 91 detectors, spacing 0.04. Search receives only data. Geometry used only after selection. All cuts on one fixed grid are evaluated.',
  cases:combined}));
