/* Synthetic truth is isolated from engine.js; only total/angles/detector go in. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../tutorial/geometry.js'), require('./engine.js'));
  else root.LPhantom = factory(root.TwoBodyGeometry, root.ConcaveGeometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G, C) {
  'use strict';
  function shape(rotation = 0) {
    const transform = ([x,y]) => [x*Math.cos(rotation)-y*Math.sin(rotation), x*Math.sin(rotation)+y*Math.cos(rotation)];
    const outline = [[-1,-.8],[1,-.8],[1,-.2],[-.35,-.2],[-.35,1],[-1,1]].map(transform);
    const pieces = [
      [[-1,-.8],[-.35,-.8],[-.35,1],[-1,1]],
      [[-.35,-.8],[1,-.8],[1,-.2],[-.35,-.2]]
    ].map(p => p.map(transform));
    return { outline, pieces, rotation };
  }
  function makeData(truth, views = 8, spacing = .04) {
    // Nonzero detector origin avoids accidental coincidence with L edges.
    const detector = Array.from({length: 91}, (_,k) => (k-45)*spacing+.013);
    const angles = Array.from({length: views}, (_,j) => j*Math.PI/views);
    const data = { detector, angles, total: [] };
    data.total = C.forward(truth.pieces, data);
    return data;
  }
  function segmentDistance(p,a,b) {
    const v=G.sub(b,a), w=G.sub(p,a), t=Math.max(0,Math.min(1,G.dot(w,v)/(G.dot(v,v)||1)));
    return Math.hypot(w[0]-t*v[0],w[1]-t*v[1]);
  }
  function inside(p, polygon) {
    let yes=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if(segmentDistance(p,a,b)<1e-10) return true;
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
    }
    return yes;
  }
  function samples(polygon, step=.005) {
    return polygon.flatMap((a,i) => {
      const b=polygon[(i+1)%polygon.length], n=Math.max(1,Math.ceil(G.norm(G.sub(a,b))/step));
      return Array.from({length:n},(_,k)=>[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);
    });
  }
  function evaluate(truth, result) {
    if (!result.best) return null;
    const output=result.best.output, boundary=samples(truth.outline);
    const toOutput=p=>Math.min(...output.map(poly=>G.pointDistance(p,poly)));
    const toTruth=p=>inside(p,truth.outline)?0:Math.min(...truth.outline.map((a,i)=>segmentDistance(p,a,truth.outline[(i+1)%truth.outline.length])));
    // Boundary-sampled distance diagnostic, not an exact union Hausdorff metric.
    const sampledHD=Math.max(...boundary.map(toOutput),...output.flatMap(p=>samples(p).map(toTruth)));
    let intersection=0, total=0;
    const grid=257, extent=1.8;
    for(let y=0;y<grid;y++) for(let x=0;x<grid;x++) {
      const p=[-extent+2*extent*x/(grid-1),-extent+2*extent*y/(grid-1)];
      const a=inside(p,truth.outline),b=output.some(poly=>inside(p,poly));
      if(a&&b) intersection++; if(a||b) total++;
    }
    const innerLeak=Math.max(0,...result.best.inner.flatMap(p=>samples(p).map(toTruth)));
    const n=G.direction(result.best.phi), offset=result.best.offset;
    const cutPieces=[1,-1].map(sign=>truth.pieces.map(p=>G.clip(p,n.map(v=>sign*v),sign*offset)).filter(G.full));
    const convexityDefects=cutPieces.map(parts=>G.area(G.hull(parts.flat()))-parts.reduce((s,p)=>s+G.area(p),0));
    const outerContainmentViolation=Math.max(0,...cutPieces.flatMap((parts,i)=>parts.flat().map(v=>G.pointDistance(v,result.best.outer[i]))));
    return { sampledBoundaryDistance:sampledHD, sampleStep:.005, gridIoU:intersection/total, grid,
      sampledInnerLeak:innerLeak, conditionalBound:result.best.bound,
      trueCutConvexityDefectArea:convexityDefects, trueCutConvexityPass:convexityDefects.every(v=>v<1e-9),
      outerContainmentViolation,
      warning:'Truth is used only here. Boundary-sampled distances are not rigorous union Hausdorff certificates; selecting a cut does not certify convexity of true pieces.' };
  }
  return { shape, makeData, evaluate, inside, samples };
});
