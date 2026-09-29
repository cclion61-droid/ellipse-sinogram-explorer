/* Two-body geometry. No ellipse parameters or ground truth enter reconstruct().
 * Browser + Node, dependency-free. Mirrors the Python research prototype.
 * Floating-point guards are not interval arithmetic or a machine certificate.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwoBodyGeometry = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-12;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const norm = a => Math.hypot(...a);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const clone = p => p.map(v => [...v]);
  const area = p => Math.abs(p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0)) / 2;
  const full = p => p.length >= 3 && area(p) > 1e-12;
  function hull(points) {
    const p = points.map(v => [...v]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .filter((v, i, all) => !i || v[0] !== all[i - 1][0] || v[1] !== all[i - 1][1]);
    if (p.length < 3) return p;
    const half = list => {
      const out = [];
      for (const v of list) {
        while (out.length > 1 && cross(out.at(-2), out.at(-1), v) <= 1e-14) out.pop();
        out.push(v);
      }
      return out.slice(0, -1);
    };
    return half(p).concat(half([...p].reverse()));
  }
  // Intersect a CCW polygon with n.x <= h. Retain the boundary.
  function clip(p, n, h) {
    if (!p.length) return [];
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const da = dot(n, a) - h, db = dot(n, b) - h;
      if (da <= EPS) out.push([...a]);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const t = da / (da - db);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return hull(out);
  }
  const direction = phi => [Math.cos(phi), Math.sin(phi)];
  const pointOnLine = (s, phi, t) => [s * Math.cos(phi) - t * Math.sin(phi), s * Math.sin(phi) + t * Math.cos(phi)];
  function strip(p, lo, hi, phi) {
    const n = direction(phi);
    return clip(clip(p, n, hi), n.map(x => -x), -lo);
  }
  function lineInterval(p, s, phi) {
    if (!full(p)) return null;
    const n = direction(phi), tangent = [-n[1], n[0]];
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], e = sub(b, a);
      const d = norm(e);
      if (d < EPS) continue;
      const outward = [e[1] / d, -e[0] / d];
      const rhs = dot(outward, a) - s * dot(outward, n), den = dot(outward, tangent);
      if (Math.abs(den) < EPS) {
        if (rhs < -EPS) return null;
      } else if (den > 0) hi = Math.min(hi, rhs / den);
      else lo = Math.max(lo, rhs / den);
    }
    return hi >= lo ? [lo, hi] : null;
  }
  const length = interval => interval ? Math.max(0, interval[1] - interval[0]) : 0;
  function positiveRuns(row) {
    const out = [];
    for (let k = 0; k < row.length; k++) if (row[k] > 0) {
      const begin = k;
      while (k + 1 < row.length && row[k + 1] > 0) k++;
      out.push([begin, k]);
    }
    return out;
  }
  function validate(data) {
    const { total, detector, angles } = data;
    if (!Array.isArray(total) || !Array.isArray(detector) || !Array.isArray(angles) || angles.length < 2 || detector.length < 3 || total.length !== angles.length) throw Error('Invalid data dimensions');
    const ds = detector[1] - detector[0];
    if (!(ds > 0) || !detector.every(Number.isFinite) || !angles.every(Number.isFinite)) throw Error('Invalid sampling grid');
    if (detector.some((s, k) => k && Math.abs(s - detector[k - 1] - ds) > 1e-9)) throw Error('Uniform detector grid required');
    if (total.some(row => !Array.isArray(row) || row.length !== detector.length || row.some(g => !Number.isFinite(g) || g < 0))) throw Error('Finite nonnegative total data required');
    return ds;
  }
  function initialize(data, window) {
    validate(data);
    const { total, detector, angles } = data;
    const runs = total.map(positiveRuns), globalHistory = [];
    let global = hull(window);
    for (let j = 0; j < angles.length; j++) {
      const r = runs[j];
      if (!r.length || r[0][0] === 0 || r.at(-1)[1] === detector.length - 1) throw Error('Detector coverage is insufficient');
      if (r.length > 2) throw Error('More than two positive blocks: model inconsistent');
      global = strip(global, detector[r[0][0] - 1], detector[r.at(-1)[1] + 1], angles[j]);
      globalHistory.push(clone(global));
    }
    let anchor = -1, gap = -Infinity;
    runs.forEach((r, j) => {
      if (r.length === 2 && r[1][0] - r[0][1] >= 3) {
        const d = detector[r[1][0]] - detector[r[0][1]];
        if (d >= gap) { gap = d; anchor = j; }
      }
    });
    const base = { global, globalHistory, runs, anchor };
    if (anchor < 0) return { ...base, status: 'no-anchor' };
    const applyRun = (p, r, j) => strip(p, detector[r[0] - 1], detector[r[1] + 1], angles[j]);
    let outer = runs[anchor].map(r => applyRun(global, r, anchor));
    if (!outer.every(full)) throw Error('Degenerate anchor enclosure');
    const anchorOuter = outer.map(clone);
    const pending = new Set(runs.map((r, j) => r.length === 2 && j !== anchor ? j : -1).filter(j => j >= 0));
    const assignments = [{ view: anchor, order: [0, 1] }];
    let changed = true;
    while (changed) {
      changed = false;
      for (const j of pending) {
        const feasible = [[0, 1], [1, 0]].map(order => ({ order,
          outer: outer.map((p, i) => applyRun(p, runs[j][order[i]], j))
        })).filter(t => t.outer.every(full));
        if (!feasible.length) throw Error('No feasible component assignment');
        if (feasible.length === 1) {
          outer = feasible[0].outer;
          assignments.push({ view: j, order: feasible[0].order });
          pending.delete(j); changed = true;
        }
      }
    }
    return { ...base, status: 'ok', outer, anchorOuter, assignments, ambiguous: [...pending] };
  }
  function rayBounds(data, outer, inner, j, k) {
    const s = data.detector[k], phi = data.angles[j], g = data.total[j][k];
    const outerIntervals = outer.map(p => lineInterval(p, s, phi));
    const innerIntervals = inner.map(p => lineInterval(p, s, phi));
    const c = outerIntervals.map(length), q = innerIntervals.map(length);
    const lower = c.map((_, i) => Math.max(0, g - c[1 - i] - 2e-10));
    const upper = q.map((_, i) => Math.max(0, g - q[1 - i]) + 1e-8);
    const mandatory = outerIntervals.map((interval, i) => {
      if (!interval || lower[i] <= 0) return null;
      const start = interval[1] - lower[i], end = interval[0] + lower[i];
      return start <= end - 1e-10 ? [start, end] : null;
    });
    return { j, k, s, phi, g, outerIntervals, innerIntervals, c, q, lower, upper, mandatory };
  }
  function deriveInner(data, outer, previous = [[], []]) {
    const points = previous.map(clone), segments = [[], []];
    for (let j = 0; j < data.angles.length; j++) for (let k = 0; k < data.detector.length; k++) {
      const ray = rayBounds(data, outer, [[], []], j, k);
      ray.mandatory.forEach((interval, i) => {
        if (!interval) return;
        const endpoints = interval.map(t => pointOnLine(ray.s, ray.phi, t));
        points[i].push(...endpoints);
        segments[i].push({ j, k, interval, endpoints, mixed: ray.c[1 - i] > 1e-10 });
      });
    }
    return { inner: points.map(hull), segments };
  }
  function coneGeometry(kernel, witness) {
    const center = kernel.reduce((a, p) => [a[0] + p[0] / kernel.length, a[1] + p[1] / kernel.length], [0, 0]);
    const reference = Math.atan2(witness[1] - center[1], witness[0] - center[0]);
    const directions = kernel.map(q => sub(witness, q));
    const relative = directions.map(d => ((Math.atan2(d[1], d[0]) - reference + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    const min = Math.min(...relative), max = Math.max(...relative);
    if (max - min >= Math.PI - 1e-10) return null;
    const low = directions[relative.indexOf(min)], high = directions[relative.indexOf(max)];
    // Inward normals: both n.(x-z) >= 0 describe the forbidden cone.
    const normals = [[-low[1], low[0]], [high[1], -high[0]]].map(n => n.map(x => x / norm(n)));
    return { low, high, normals };
  }
  function excludeShadow(polygon, kernel, witness) {
    if (!full(kernel)) return { polygon, changed: false };
    const cone = coneGeometry(kernel, witness);
    if (!cone || !polygon.some(p => cone.normals.every(n => dot(n, sub(p, witness)) > 1e-9))) return { polygon, changed: false, cone };
    const pieces = cone.normals.map(n => clip(polygon, n, dot(n, witness)));
    const result = hull(pieces.flat());
    if (!full(result)) throw Error('Exclusion removed the enclosure');
    return { polygon: result, changed: area(result) < area(polygon) - 1e-13, cone };
  }
  function pointDistance(p, polygon) {
    let inside = true, distance = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], edge = sub(b, a), v = sub(p, a);
      if (cross(a, b, p) < -EPS) inside = false;
      const t = Math.max(0, Math.min(1, dot(v, edge) / (dot(edge, edge) || 1)));
      distance = Math.min(distance, Math.hypot(v[0] - t * edge[0], v[1] - t * edge[1]));
    }
    return inside ? 0 : distance;
  }
  const enclosureBound = (outer, inner) => .5 * Math.max(...outer.flatMap((p, i) => p.map(v => pointDistance(v, inner[i]))));
  const midpoint = (q, p) => hull(q.flatMap(a => p.map(b => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])));
  function refine(data, startingOuter, startingInner, rounds) {
    let outer = startingOuter.map(clone), inner = startingInner.map(clone), event = null;
    const states = [{ round: 0, outer: outer.map(clone), inner: inner.map(clone), cuts: 0, bound: enclosureBound(outer, inner) }];
    let totalCuts = 0;
    for (let round = 1; round <= rounds; round++) {
      let cuts = 0;
      // Inner enclosures are frozen during an entire outer-cut sweep.
      for (let j = 0; j < data.angles.length; j++) for (let k = 0; k < data.detector.length; k++) {
        const ray = rayBounds(data, outer, inner, j, k);
        for (let i = 0; i < 2; i++) {
          if (ray.q[i] <= 1e-7) continue;
          const [a, b] = ray.innerIntervals[i], U = ray.upper[i];
          for (const t of [b - U - 1e-8, a + U + 1e-8]) {
            const witness = pointOnLine(ray.s, ray.phi, t), before = outer[i];
            const result = excludeShadow(before, inner[i], witness);
            if (result.changed) {
              cuts++;
              const gain = area(before) - area(result.polygon);
              // Store the largest actual mixed-ray cut for a readable teaching example.
              // Selection uses enclosures only, never true individual chord lengths.
              if (ray.q[1 - i] > 1e-7 && (!event || gain > event.gain)) event = {
                round, i, ray, witness, t, gain, cone: result.cone,
                before: outer.map(clone), inner: inner.map(clone), after: clone(result.polygon)
              };
              outer[i] = result.polygon;
            }
          }
        }
      }
      inner = deriveInner(data, outer, inner).inner;
      const bound = enclosureBound(outer, inner);
      if (bound > states.at(-1).bound + 1e-7) throw Error('Nonmonotone enclosure bound');
      states.push({ round, outer: outer.map(clone), inner: inner.map(clone), cuts, bound });
      totalCuts += cuts;
      if (!cuts) break;
    }
    return { outer, inner, states, event, totalCuts, output: outer.map((p, i) => midpoint(inner[i], p)) };
  }
  function reconstruct(data, options = {}) {
    const extent = options.extent || 1.8;
    const window = options.window || [[-extent, -extent], [extent, -extent], [extent, extent], [-extent, extent]];
    const init = initialize(data, window);
    if (init.status !== 'ok') return { status: init.status, init };
    const seed = deriveInner(data, init.outer);
    if (!seed.inner.every(full)) return { status: 'no-inner', init, seed };
    const refined = refine(data, init.outer, seed.inner, options.rounds ?? 3);
    return { status: 'ok', init, seed, ...refined };
  }
  return { dot, sub, norm, cross, hull, clip, strip, area, full, direction, pointOnLine,
    lineInterval, length, positiveRuns, initialize, rayBounds, deriveInner, coneGeometry,
    excludeShadow, pointDistance, enclosureBound, midpoint, refine, reconstruct };
});
