const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./engine.js'),P=require('./phantom.js'),O=require('./optimization.js'),M=require('./models.js');
test('the same L shape has two different convex cuts and identical total Radon data',()=>{
  const vertical=P.shape().pieces;
  const horizontal=[M.rectangle(-1,-.8,1,-.2),M.rectangle(-1,-.2,-.35,1)];
  const sampling=P.makeData(P.shape(),8);
  const first=C.forward(vertical,sampling),second=C.forward(horizontal,sampling);
  for(let j=0;j<sampling.angles.length;j++)for(let k=0;k<sampling.detector.length;k++)
    assert.ok(Math.abs(first[j][k]-second[j][k])<1e-10);
  const pv=vertical.reduce((s,p)=>s+O.perimeter(p),0);
  const ph=horizontal.reduce((s,p)=>s+O.perimeter(p),0);
  assert.ok(Math.abs(pv-8.8)<1e-12);assert.ok(Math.abs(ph-8.9)<1e-12);
});
test('the declared finite grid is exhaustive and independent of the sinogram',()=>{
  const cuts=O.grid({directions:24,offsetLimit:1.6,offsetStep:.05});
  assert.equal(cuts.length,1560);
  assert.ok(cuts.some(c=>c.phi===0&&Math.abs(c.offset+.35)<1e-12));
  assert.ok(cuts.some(c=>Math.abs(c.phi-Math.PI/2)<1e-12&&Math.abs(c.offset+.2)<1e-12));
});
test('L selection minimizes perimeter within the declared data fit band',()=>{
  const data=P.makeData(P.shape(),8),result=O.optimize(data);
  assert.equal(result.candidates.length,O.grid(result.config).length);
  assert.equal(result.status,'candidate-found');
  assert.ok(Math.abs(result.best.phi)<1e-12);
  assert.ok(Math.abs(result.best.offset+.35)<1e-12);
  assert.ok(result.best.score<=result.minimumResidual+result.config.fidelitySlack);
  const admissible=result.candidates.filter(c=>c.status==='compatible'&&
    c.residual<=result.minimumResidual+result.config.fidelitySlack+1e-14);
  assert.equal(result.best.perimeter,Math.min(...admissible.map(c=>c.perimeter)));
  assert.equal(result.admissibleCount,admissible.length);
});
test('aligned T has a feasible cut; U is reported as grid failure',()=>{
  const shapes=M.cases();
  const t=O.optimize(P.makeData(shapes.find(c=>c.id==='T').truth,8));
  const u=O.optimize(P.makeData(shapes.find(c=>c.id==='U').truth,8));
  assert.equal(t.status,'candidate-found');assert.ok(Math.abs(t.best.phi-Math.PI/2)<1e-12);
  assert.equal(u.status,'no-candidate');assert.equal(u.best,null);
});
