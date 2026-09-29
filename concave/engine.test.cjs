const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../tutorial/geometry.js'),C=require('./engine.js'),P=require('./phantom.js');
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
test('binary forward projection merges shared boundary chords',()=>{
  const pieces=[rect(-1,-1,0,1),rect(0,-1,1,1)];
  assert.equal(C.forward(pieces,{angles:[0],detector:[0]})[0][0],2);
  assert.equal(C.unionLength([[0,2],[1,3],[4,5]]),4);
});
test('multi-piece length bounds retain true contributions',()=>{
  const outer=[rect(-1,-2,1,-.5),rect(-1,-.4,1,.5),rect(-1,.8,1,2)];
  const inner=[rect(-.5,-1.8,.5,-.8),rect(-.5,-.2,.5,.3),rect(-.5,1,.5,1.8)];
  const actual=[1.2,.7,1],data={angles:[0],detector:[0],total:[[2.9]]};
  const r=C.ray(data,outer,inner,0,0);
  actual.forEach((v,i)=>{assert.ok(v>=r.lower[i]);assert.ok(v<=r.upper[i]);});
});
test('known correct L partition preserves containment at every round',()=>{
  const truth=P.shape(),data=P.makeData(truth,8),global=C.globalOuter(data,1.8);
  const result=C.cutCandidate(data,global,0,-.35,3);
  assert.equal(result.status,'compatible');
  let previous=Infinity;
  result.states.forEach(state=>{
    assert.ok(state.bound<=previous+1e-7);previous=state.bound;
    truth.pieces.forEach((poly,i)=>poly.forEach(v=>assert.ok(G.pointDistance(v,state.outer[i])<1e-7)));
    state.inner.forEach((poly,i)=>poly.forEach(v=>assert.ok(G.pointDistance(v,truth.pieces[i])<1e-7)));
  });
});
test('a wrong convex-cut hypothesis can be excluded by total data',()=>{
  const data=P.makeData(P.shape(),8);
  const result=C.cutCandidate(data,C.globalOuter(data,1.8),0,.5,3);
  assert.equal(result.status,'contradiction');assert.ok(result.check.violation>2e-7);
});
test('detector ray coincident with a proposed cut is explicitly skipped',()=>{
  const data=P.makeData(P.shape(),8);
  assert.equal(C.cutCandidate(data,C.globalOuter(data,1.8),0,data.detector[45],3).status,'boundary-ray');
});
test('unknown-cut search uses measurement-only input and minimizes evaluated full-data residual',()=>{
  const data=P.makeData(P.shape(),8),before=JSON.stringify(data);
  assert.deepEqual(Object.keys(data).sort(),['angles','detector','total']);
  const result=C.search(data);
  assert.equal(JSON.stringify(data),before);assert.equal(result.status,'candidate-found');
  const compatible=result.candidates.filter(c=>c.status==='compatible');
  assert.equal(result.best.score,Math.min(...compatible.map(c=>c.score)));
  assert.ok(result.best.score<.01);
  const evaluation=P.evaluate(P.shape(),result);
  assert.ok(Number.isFinite(evaluation.outerContainmentViolation));
  assert.equal(result.best.score,C.residual(result.best.output,data).relative);
  result.history.forEach((h,i)=>{if(i)assert.ok(h.score<result.history[i-1].score);});
});
test('fixed coarse cut grid does not depend on the measured angle count',()=>{
  const options={refinementLevels:0,seedViews:0};
  const a=C.search(P.makeData(P.shape(),8),options),b=C.search(P.makeData(P.shape(),16),options);
  assert.deepEqual(a.candidates.map(c=>[c.phi,c.offset]),b.candidates.map(c=>[c.phi,c.offset]));
  assert.equal(b.status,'candidate-found');assert.ok(b.best.score<1e-6);
});
test('candidate budgets are enforced and invalid settings rejected',()=>{
  const data=P.makeData(P.shape(),4);
  const result=C.search(data,{maxCandidates:7});
  assert.equal(result.candidates.length,7);assert.equal(result.termination,'candidate-budget');
  assert.throws(()=>C.search(data,{directions:0}),/Invalid directions/);
});
test('refinement continues after an entirely infeasible coarse grid',()=>{
  const data=P.makeData(P.shape(Math.PI/8),8);
  const result=C.search(data,{refinementLevels:3,seedViews:0});
  assert.equal(result.stages[0].compatible,0);
  assert.equal(result.status,'candidate-found');
  assert.ok(result.candidates.some(c=>c.phase.startsWith('refine-')&&c.status==='compatible'));
});
test('subset proposals are rechecked and scored on all measurements',()=>{
  const data=P.makeData(P.shape(Math.PI/8),8);
  const result=C.search(data,{refinementLevels:3,seedViews:4});
  assert.deepEqual(result.seedSearch.indices,[0,2,4,6]);
  const proposals=result.candidates.filter(c=>c.phase==='subset-recheck');
  assert.ok(proposals.length>0);
  for(const c of proposals){
    const checked=C.cutCandidate(data,result.global,c.phi,c.offset,result.config.rounds);
    assert.equal(checked.status,c.status);
    if(c.status==='compatible')assert.equal(checked.score,c.score);
  }
  assert.equal(result.totalEvaluations,result.candidates.length+result.seedSearch.tried);
});
