/* Outward-rounded cut regions in exact geometry; floating results are diagnostic. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../tutorial/geometry.js'),require('./engine.js'));
  else root.CutBox = factory(root.TwoBodyGeometry,root.ConcaveGeometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G,C) {
  'use strict';
  function outerCaps(global, box) {
    const phi=(box.phiLo+box.phiHi)/2,offset=(box.sLo+box.sHi)/2;
    const radius=Math.max(...global.map(G.norm));
    const margin=(box.sHi-box.sLo)/2+2*radius*Math.sin((box.phiHi-box.phiLo)/4);
    const n=G.direction(phi);
    return {margin,outer:[G.clip(global,n,offset+margin),
      G.clip(global,n.map(v=>-v),-offset+margin)]};
  }
  function inspect(data,global,box,rounds=2,refinementRounds=0) {
    if (!(box.phiLo>=0&&box.phiHi<=Math.PI&&box.phiHi>box.phiLo&&box.sHi>box.sLo))
      throw Error('Invalid cut parameter box');
    const {margin,outer}=outerCaps(global,box);
    if (!outer.every(G.full))return {status:'excluded',reason:'degenerate-cap',margin,violation:Infinity};
    // A cut can coincide with a measured line only when both its parameters
    // lie in this box. Such rays are omitted to preserve additive lengths.
    const usable=(j,k)=>!(box.phiLo<=data.angles[j]&&data.angles[j]<=box.phiHi&&
      box.sLo<=data.detector[k]&&data.detector[k]<=box.sHi);
    const grow=inner=>{
      const points=inner.map(poly=>poly.map(v=>[...v]));
      for(let j=0;j<data.angles.length;j++)for(let k=0;k<data.detector.length;k++) {
        if(!usable(j,k))continue;
        const r=C.ray(data,outer,inner,j,k);
        r.p.forEach((interval,i)=>{
          if(!interval||r.lower[i]<=0)return;
          const a=interval[1]-r.lower[i],b=interval[0]+r.lower[i];
          if(b>a+1e-10)points[i].push(G.pointOnLine(r.s,r.phi,a),G.pointOnLine(r.s,r.phi,b));
        });
      }
      return points.map(G.hull);
    };
    let inner=outer.map(()=>[]);
    for(let i=0;i<rounds;i++)inner=grow(inner);
    const audit=()=>{
      let violation=0,witness=null,skipped=0;
      inner.forEach((poly,i)=>poly.forEach(v=>{violation=Math.max(violation,G.pointDistance(v,outer[i]));}));
      for(let j=0;j<data.angles.length;j++)for(let k=0;k<data.detector.length;k++) {
        if(!usable(j,k)){skipped++;continue;}
        const r=C.ray(data,outer,inner,j,k),v=Math.max(r.qSum-r.g,r.g-r.cSum,0);
        if(v>violation){violation=v;witness={j,k,g:r.g,minimum:r.qSum,maximum:r.cSum};}
      }
      return {violation,witness,skipped};
    };
    let check=audit(),step=0;
    try {
      while(check.violation<=2e-7&&inner.every(G.full)&&step<refinementRounds) {
        let cuts=0;
        for(let j=0;j<data.angles.length;j++)for(let k=0;k<data.detector.length;k++) {
          if(!usable(j,k))continue;
          const ray=C.ray(data,outer,inner,j,k);
          if(ray.qSum>ray.g+2e-7||ray.cSum<ray.g-2e-7)continue;
          for(let i=0;i<2;i++) {
            if(ray.known[i]<=1e-7)continue;
            const [a,b]=ray.q[i],upper=ray.upper[i];
            for(const t of [b-upper-2e-8,a+upper+2e-8]) {
              const updated=G.excludeShadow(outer[i],inner[i],G.pointOnLine(ray.s,ray.phi,t));
              if(updated.changed){outer[i]=updated.polygon;cuts++;}
            }
          }
        }
        inner=grow(inner);check=audit();step++;
        if(!cuts)break;
      }
    } catch(error) { return {status:'undecided',reason:'numerical-error',margin,violation:check.violation,
      witness:check.witness,skipped:check.skipped,outer,inner,message:error.message}; }
    const excluded=check.violation>2e-7;
    return {status:excluded?'excluded':'undecided',reason:excluded?'mandatory-chord':null,
      margin,...check,refinementSteps:step,outer,inner};
  }
  function search(data,options={},progress=()=>{}) {
    const config={extent:1.8,directions:24,offsetStep:.05,offsetLimit:1.6,
      maxBoxes:15000,maxDepth:40,targetResidual:1e-6,...options};
    const global=C.globalOuter(data,config.extent);
    const radius=Math.max(...global.map(G.norm)),last=Math.floor(config.offsetLimit/config.offsetStep+1e-9);
    const queue=[],stats={inspected:0,excluded:0,undecided:0,pointTests:0,depthLimitLeaves:0};
    let best=null,found=null;
    function jumpPriority(box) {
      let peak=0;
      for(let j=0;j<data.angles.length;j++) {
        if(data.angles[j]<box.phiLo-1e-12||data.angles[j]>box.phiHi+1e-12)continue;
        for(let k=0;k<data.detector.length-1;k++) {
          if(data.detector[k+1]<box.sLo||data.detector[k]>box.sHi)continue;
          peak=Math.max(peak,Math.abs(data.total[j][k+1]-data.total[j][k]));
        }
      }
      return peak;
    }
    function visit(box,depth) {
      const diagnosis=inspect(data,global,box,2,2);
      stats.inspected++;
      if(diagnosis.status==='excluded'){stats.excluded++;return;}
      stats.undecided++;
      queue.push({box,depth,margin:diagnosis.margin,priority:jumpPriority(box)});
    }
    for(let a=0;a<config.directions;a++)for(let k=-last;k<last;k++)
      visit({phiLo:a*Math.PI/config.directions,phiHi:(a+1)*Math.PI/config.directions,
        sLo:k*config.offsetStep,sHi:(k+1)*config.offsetStep},0);
    const coarse={...stats,retained:queue.length};
    // Equal-area coarse tiles are exhausted. Subdivision changes priority,
    // never the logically safe exclusion test above.
    queue.sort((a,b)=>a.priority-b.priority||b.box.phiLo-a.box.phiLo||b.box.sLo-a.box.sLo);
    const tested=new Set();
    while(queue.length && stats.inspected<config.maxBoxes && !found) {
      const node=queue.pop(),b=node.box;
      if(node.margin<.045) {
        const midPhi=(b.phiLo+b.phiHi)/2,midS=(b.sLo+b.sHi)/2;
        for(const phi of [midPhi,b.phiLo,b.phiHi]) {
          if(phi>=Math.PI)continue;
          const key=phi.toFixed(12)+':'+midS.toFixed(12);
          if(tested.has(key))continue;tested.add(key);
          const candidate=C.cutCandidate(data,global,phi,midS,3);stats.pointTests++;
          if(candidate.status==='compatible' && (!best||candidate.score<best.score))best=candidate;
          if(candidate.status==='compatible'&&candidate.score<=config.targetResidual){found=candidate;break;}
        }
      }
      if(found)break;
      if(node.depth>=config.maxDepth){stats.depthLimitLeaves++;continue;}
      const phiCost=2*radius*Math.sin((b.phiHi-b.phiLo)/4),sCost=(b.sHi-b.sLo)/2;
      let children;
      if(phiCost>=sCost){const mid=(b.phiLo+b.phiHi)/2;
        children=[{...b,phiHi:mid},{...b,phiLo:mid}];
      }else{const mid=(b.sLo+b.sHi)/2;
        children=[{...b,sHi:mid},{...b,sLo:mid}];}
      const childStart=queue.length;
      for(const child of children)visit(child,node.depth+1);
      if(queue.length>childStart) {
        const siblings=queue.splice(childStart).sort((a,b)=>a.priority-b.priority);
        queue.push(...siblings);
      }
      if(stats.inspected%500===0)progress({...stats,pending:queue.length,best:best?.score??null});
    }
    return {config,coarse,stats,pending:queue.length,found,best,
      status:found?'target-found':queue.length||stats.depthLimitLeaves?'budget-or-depth-limit':
        best?'compatible-but-target-not-met':'all-boxes-excluded',
      warning:'Exclusion follows from necessary chord inequalities in exact arithmetic; this floating-point implementation is not interval-certified.'};
  }
  return {outerCaps,inspect,search};
});
