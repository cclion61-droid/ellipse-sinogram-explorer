const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./engine.js'),B=require('./cut-box.js');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'optimization-results.json'),'utf8'));
const cases=[];
for(const item of source.cases) {
  const global=C.globalOuter(item.data,1.8),kept=[];
  let excluded=0,minExcludedViolation=Infinity,skippedRays=0;
  for(let a=0;a<24;a++)for(let k=-32;k<32;k++) {
    const box={phiLo:a*Math.PI/24,phiHi:(a+1)*Math.PI/24,sLo:k*.05,sHi:(k+1)*.05};
    const diagnosis=B.inspect(item.data,global,box);
    skippedRays+=diagnosis.skipped||0;
    if(diagnosis.status==='excluded') {
      excluded++;
      if(Number.isFinite(diagnosis.violation))minExcludedViolation=Math.min(minExcludedViolation,diagnosis.violation);
    } else kept.push({a,k,margin:diagnosis.margin});
  }
  cases.push({id:item.id,boxes:1536,excluded,retained:kept.length,
    minimumFiniteExcludedViolation:Number.isFinite(minExcludedViolation)?minExcludedViolation:null,
    skippedRayOccurrences:skippedRays,retainedBoxes:kept});
  console.log(JSON.stringify({id:item.id,excluded,retained:kept.length,
    minimumFiniteExcludedViolation:cases.at(-1).minimumFiniteExcludedViolation}));
}
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'cut-box.js'))).digest('hex');
fs.writeFileSync(path.join(__dirname,'box-results.json'),JSON.stringify({date:'2026-09-29',cutBoxSha256:hash,
  scope:'24 x 64 parameter boxes cover phi in [0,pi] and s in [-1.6,1.6]. Two rounds of mandatory-chord propagation. Potentially coincident measurement rays omitted.',
  warning:'The exclusion rule has an exact-geometry proof, but these numerical results are not interval-arithmetic certified.',cases},null,2));
