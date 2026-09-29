const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./geometry.js');
const F = require('./phantom.js');
const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const square = [[-1,-1],[1,-1],[1,1],[-1,1]];

test('analytic circle chord, ellipse area and tangent', () => {
  const e = { cx: 0, cy: 0, a: .7, b: .7, rotation: .3 };
  near(F.radon(e, .2, .8), 2 * Math.sqrt(.49 - .04));
  assert.equal(F.chord(e, 1, 0), null);
  const ds = .0002, ellipse = F.demo[0];
  let integral = 0;
  for (let s = -1.8; s < 1.8; s += ds) integral += F.radon(ellipse, s, .71) * ds;
  near(integral, Math.PI * ellipse.a * ellipse.b, 1e-5);
});
test('CCW convex hull and half-plane clipping', () => {
  near(G.area(G.hull([...square, [0,0], [1,1]])), 4);
  const p = G.clip(square, [1,0], 0);
  near(G.area(p), 2);
  assert.ok(p.every(v => v[0] <= 1e-12));
  assert.deepEqual(G.lineInterval(square, 0, 0), [-1,1]);
  assert.equal(G.lineInterval(square, 2, 0), null);
});
test('mandatory interval [2,8] follows from outer [0,10], length >= 8', () => {
  const p = [[0,0],[10,0],[10,10],[0,10]];
  const other = p.map(v => [v[0]+20,v[1]]);
  const data = { total: [[8]], angles: [0], detector: [5] };
  const r = G.rayBounds(data,[p,other],[[],[]],0,0);
  near(r.mandatory[0][0],2); near(r.mandatory[0][1],8);
  const short = G.rayBounds({ ...data, total:[[3]] },[p,other],[[],[]],0,0);
  assert.equal(short.mandatory[0], null);
});
test('midpoint and vertex-based enclosure error', () => {
  const p = square.map(v => v.map(x => 2*x));
  const mid = G.midpoint(square, p);
  near(G.area(mid),9);
  near(G.enclosureBound([p,p],[square,square]),Math.SQRT2/2);
  near(G.pointDistance([0,0],square),0);
});
test('exclusion cone points AWAY from the inner enclosure', () => {
  const q = square.map(v => v.map(x => .3*x)), p = square.map(v => v.map(x => 2*x));
  const cut = G.excludeShadow(p,q,[1.1,1.1]);
  assert.ok(cut.changed);
  assert.ok(G.area(cut.polygon)<G.area(p));
  for (const v of square) near(G.pointDistance(v,cut.polygon),0);
  // A narrow cone hitting the middle of an edge need not remove any vertex.
  // Convexification can restore the removed region: strict progress is NOT promised.
  assert.equal(G.excludeShadow(p,q,[1.1,0]).changed,false);
});
test('positive blocks and unsupported input report failure, not invented shapes', () => {
  assert.deepEqual(G.positiveRuns([0,2,3,0,0,1,0]),[[1,2],[5,5]]);
  assert.equal(G.reconstruct(F.makeData(F.close,8)).status,'no-anchor');
  assert.throws(()=>G.reconstruct({total:[[-1,0,0],[0,0,0]],detector:[0,1,2],angles:[0,1]}));
});
test('default grid has 121 detectors, [-1.8,1.8] coverage', () => {
  const data=F.makeData();
  assert.equal(data.detector.length,121);
  near(data.detector[0],-1.8);near(data.detector.at(-1),1.8);
});
test('1000 scalar feasible intervals preserve each generated true chord', () => {
  let seed=826031;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<1000;n++) {
    const capacity=1+random()*10,truthLength=capacity*(.1+.9*random());
    const start=random()*(capacity-truthLength),end=start+truthLength;
    const lower=truthLength*random(),a=0,b=capacity;
    if(b-lower<=a+lower) {
      assert.ok(start<=b-lower+1e-12);
      assert.ok(end>=a+lower-1e-12);
    }
    const innerLeft=start+truthLength*.2,innerRight=end-truthLength*.2,upper=truthLength+random();
    assert.ok(start>=innerRight-upper-1e-12);
    assert.ok(end<=innerLeft+upper+1e-12);
  }
});
for (const views of [4,8,16]) test(`end-to-end ${views} views: enclosures, nested updates, error bound`, () => {
  const data = F.makeData(F.demo,views);
  // The public reconstruction input has exactly THREE fields: no ellipse labels.
  assert.deepEqual(Object.keys(data).sort(),['angles','detector','total']);
  const saved = JSON.stringify(data), result = G.reconstruct(data);
  assert.equal(JSON.stringify(data),saved,'input should not be mutated');
  assert.equal(result.status,'ok');
  const n = G.direction(data.angles[result.init.anchor]);
  const truth = [...F.demo].sort((a,b)=>a.cx*n[0]+a.cy*n[1]-b.cx*n[0]-b.cy*n[1]);
  let previous = null;
  for (const state of result.states) {
    for (let i=0;i<2;i++) {
      const e=truth[i], p=state.outer[i], q=state.inner[i];
      // Analytic support check for every outer edge: the ENTIRE ellipse is inside.
      for(let k=0;k<p.length;k++) {
        const a=p[k], b=p[(k+1)%p.length], v=[b[1]-a[1],a[0]-b[0]], len=G.norm(v);
        const phi=Math.atan2(v[1],v[0]);
        assert.ok(F.support(e,phi)<=G.dot(v,a)/len+1e-7,'outer contains ellipse');
      }
      // Ellipse convexity + all inner vertices inside implies full inner containment.
      assert.ok(q.every(v=>F.implicit(e,v)<=1+1e-7),'inner is inside ellipse');
      if(previous) {
        assert.ok(p.every(v=>G.pointDistance(v,previous.outer[i])<1e-7));
        assert.ok(previous.inner[i].every(v=>G.pointDistance(v,q)<1e-7));
      }
    }
    if(previous) assert.ok(state.bound<=previous.bound+1e-7);
    previous=state;
  }
  // Sampled support difference is diagnostic, not a continuous-HD certificate.
  for(let i=0;i<2;i++) for(let j=0;j<2048;j++) {
    const phi=2*Math.PI*j/2048, n=G.direction(phi);
    const h=Math.max(...result.output[i].map(v=>G.dot(v,n)));
    assert.ok(Math.abs(h-F.support(truth[i],phi))<=previous.bound+1e-7);
  }
  assert.ok(result.seed.segments.flat().some(s=>s.mixed));
  assert.ok(result.event && result.event.gain>0,'real mixed-ray exclusion event exists');
});
