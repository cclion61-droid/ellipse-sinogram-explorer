/* Test phantoms. This module is never imported by optimization.js. */
const P = require('./phantom.js');
function transform(truth, rotation = 0, shift = [0, 0]) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const move = ([x, y]) => [c*x - s*y + shift[0], s*x + c*y + shift[1]];
  return { outline: truth.outline.map(move), pieces: truth.pieces.map(poly => poly.map(move)) };
}
const rectangle = (x0, y0, x1, y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const baseL = P.shape();
const baseT = {
  outline: [[-.22,-.85],[.25,-.85],[.25,.3],[1,.3],[1,.75],[-1,.75],[-1,.3],[-.22,.3]],
  pieces: [rectangle(-.22,-.85,.25,.3),rectangle(-1,.3,1,.75)]
};
const baseU = {
  outline: [[-1,-.8],[1,-.8],[1,.8],[.58,.8],[.58,-.48],[-.64,-.48],[-.64,.8],[-1,.8]],
  pieces: [rectangle(-1,-.8,1,-.48),rectangle(-1,-.48,-.64,.8),rectangle(.58,-.48,1,.8)]
};
function cases() {
  return [
    { id:'L', label:'L 型', truth:transform(baseL), model:'two convex pieces' },
    { id:'L-shift', label:'平移 L 型（切線不落網格）', truth:transform(baseL,0,[.11,-.07]), model:'two convex pieces' },
    { id:'L-rotate17', label:'旋轉 17° L 型', truth:transform(baseL,17*Math.PI/180), model:'two convex pieces' },
    { id:'T', label:'T 型', truth:transform(baseT), model:'two convex pieces' },
    { id:'T-shift', label:'平移 T 型', truth:transform(baseT,0,[.09,.06]), model:'two convex pieces' },
    { id:'U', label:'U 型（兩片模型的反例）', truth:transform(baseU), model:'requires at least three straight-cut convex pieces' }
  ];
}
module.exports = { transform, rectangle, cases };
