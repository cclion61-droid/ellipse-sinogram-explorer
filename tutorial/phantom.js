/* Simulation/evaluation only. This module is NOT imported by geometry.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EllipsePhantom = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const demo = [
    { cx: -.63, cy: -.16, a: .54, b: .32, rotation: .28 },
    { cx: .60, cy: .22, a: .43, b: .29, rotation: -.45 }
  ];
  const v = [Math.cos(Math.PI / 16), Math.sin(Math.PI / 16)];
  const close = [-1, 1].map(sign => ({ cx: sign * .4205 * v[0], cy: sign * .4205 * v[1], a: .42, b: .42, rotation: 0 }));
  function chord(e, s, phi) {
    const c = Math.cos(e.rotation), u = Math.sin(e.rotation);
    const dx = s * Math.cos(phi) - e.cx, dy = s * Math.sin(phi) - e.cy;
    const x = (c * dx + u * dy) / e.a, y = (-u * dx + c * dy) / e.b;
    const tx = (-c * Math.sin(phi) + u * Math.cos(phi)) / e.a;
    const ty = (u * Math.sin(phi) + c * Math.cos(phi)) / e.b;
    const A = tx * tx + ty * ty, B = x * tx + y * ty, C = x * x + y * y - 1;
    const disc = B * B - A * C;
    if (disc <= 0) return null;
    const h = Math.sqrt(disc);
    return [(-B - h) / A, (-B + h) / A];
  }
  const radon = (e, s, phi) => { const p = chord(e, s, phi); return p ? p[1] - p[0] : 0; };
  function boundary(e, count = 240) {
    const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
    return Array.from({ length: count }, (_, k) => {
      const t = 2 * Math.PI * k / count, x = e.a * Math.cos(t), y = e.b * Math.sin(t);
      return [e.cx + c * x - s * y, e.cy + s * x + c * y];
    });
  }
  function support(e, phi) {
    const t = phi - e.rotation;
    return e.cx * Math.cos(phi) + e.cy * Math.sin(phi) + Math.hypot(e.a * Math.cos(t), e.b * Math.sin(t));
  }
  function implicit(e, p) {
    const x = p[0] - e.cx, y = p[1] - e.cy, c = Math.cos(e.rotation), s = Math.sin(e.rotation);
    return ((c * x + s * y) / e.a) ** 2 + ((-s * x + c * y) / e.b) ** 2;
  }
  function makeData(ellipses = demo, views = 8, spacing = .03) {
    const angles = Array.from({ length: views }, (_, j) => j * Math.PI / views);
    const K = Math.ceil(1.8 / spacing - 1e-10);
    const detector = Array.from({ length: 2 * K + 1 }, (_, k) => (k - K) * spacing);
    // These two provided presets are disjoint. The sum equals binary union data.
    // Arbitrary overlapping inputs would instead produce density-addition data.
    const total = angles.map(phi => detector.map(s => ellipses.reduce((g, e) => g + radon(e, s, phi), 0)));
    return { total, angles, detector };
  }
  return { demo, close, chord, radon, boundary, support, implicit, makeData };
});
