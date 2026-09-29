const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../tutorial/geometry.js'),C=require('./engine.js'),P=require('./phantom.js');
const M=require('./models.js'),B=require('./cut-box.js');
test('a cut parameter box contains every true piece of an off-grid L partition',()=>{
  const truth=M.cases().find(c=>c.id==='L-shift').truth;
  const data=P.makeData(truth,8),global=C.globalOuter(data,1.8);
  const box={phiLo:0,phiHi:2*Math.PI/180,sLo:-.26,sHi:-.22};
  const caps=B.outerCaps(global,box).outer;
  truth.pieces.forEach((p,i)=>p.forEach(v=>assert.ok(G.pointDistance(v,caps[i])<1e-9)));
  assert.equal(B.inspect(data,global,box).status,'undecided');
});
test('a genuine off-grid T cut is not pruned by the box test',()=>{
  const truth=M.cases().find(c=>c.id==='T-shift').truth;
  const data=P.makeData(truth,8),global=C.globalOuter(data,1.8);
  assert.equal(B.inspect(data,global,{phiLo:Math.PI/2-.01,phiHi:Math.PI/2+.01,
    sLo:.35,sHi:.4}).status,'undecided');
});
test('coincident measurement rays are excluded from every applicable box check',()=>{
  const truth=P.shape(),detector=Array.from({length:91},(_,k)=>(k-45)*.04+.01);
  const angles=Array.from({length:8},(_,j)=>j*Math.PI/8);
  const data={detector,angles,total:[]};data.total=C.forward(truth.pieces,data);
  const global=C.globalOuter(data,1.8);
  const result=B.inspect(data,global,{phiLo:0,phiHi:.01,sLo:-.36,sHi:-.34});
  assert.ok(result.skipped>0);assert.equal(result.status,'undecided');
});
test('all fixed coarse parameter boxes of the U phantom are excluded numerically',()=>{
  const truth=M.cases().find(c=>c.id==='U').truth;
  const data=P.makeData(truth,8),global=C.globalOuter(data,1.8);
  let remaining=0;
  for(let a=0;a<24;a++)for(let k=-32;k<32;k++) {
    const box={phiLo:a*Math.PI/24,phiHi:(a+1)*Math.PI/24,sLo:k*.05,sHi:(k+1)*.05};
    if(B.inspect(data,global,box).status!=='excluded')remaining++;
  }
  assert.equal(remaining,0);
});
