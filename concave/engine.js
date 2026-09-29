/* Candidate convex partitions from total data only. No phantom import. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../tutorial/geometry.js'));
  else root.ConcaveGeometry = factory(root.TwoBodyGeometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const clone = p => p.map(v => [...v]);
  const TOL = 2e-7;
  function unionLength(intervals) {
    const sorted = intervals.filter(Boolean).filter(v => v[1] > v[0]).sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [a, b] of sorted) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
    return total;
  }
  function forward(polygons, data) {
    return data.angles.map(phi => data.detector.map(s => unionLength(polygons.map(p => G.lineInterval(p, s, phi)))));
  }
  function residual(polygons, data) {
    const predicted = forward(polygons, data);
    let error = 0, scale = 0;
    data.total.forEach((row, j) => row.forEach((v, k) => { error += (predicted[j][k] - v) ** 2; scale += v * v; }));
    return { relative: Math.sqrt(error / scale), predicted };
  }
  function globalOuter(data, extent) {
    let p = [[-extent, -extent], [extent, -extent], [extent, extent], [-extent, extent]];
    for (let j = 0; j < data.angles.length; j++) {
      const runs = G.positiveRuns(data.total[j]);
      if (!runs.length || !runs[0][0] || runs.at(-1)[1] === data.detector.length - 1) throw Error('Detector coverage is insufficient');
      p = G.strip(p, data.detector[runs[0][0] - 1], data.detector[runs.at(-1)[1] + 1], data.angles[j]);
    }
    return p;
  }
  function ray(data, outer, inner, j, k) {
    const s = data.detector[k], phi = data.angles[j], g = data.total[j][k];
    const p = outer.map(v => G.lineInterval(v, s, phi)), q = inner.map(v => G.lineInterval(v, s, phi));
    const capacity = p.map(G.length), known = q.map(G.length);
    const cSum = capacity.reduce((a, b) => a + b, 0), qSum = known.reduce((a, b) => a + b, 0);
    return { s, phi, g, p, q, capacity, known, cSum, qSum,
      lower: capacity.map((_, i) => Math.max(known[i], g - (cSum - capacity[i]) - 2e-10, 0)),
      upper: capacity.map((c, i) => Math.min(c, g - (qSum - known[i]) + 1e-8)) };
  }
  function audit(data, outer, inner) {
    let violation = 0, witness = null;
    inner.forEach((p, i) => p.forEach(v => { violation = Math.max(violation, G.pointDistance(v, outer[i])); }));
    for (let j = 0; j < data.angles.length; j++) for (let k = 0; k < data.detector.length; k++) {
      const r = ray(data, outer, inner, j, k);
      const v = Math.max(r.g - r.cSum, r.qSum - r.g, 0);
      if (v > violation) { violation = v; witness = { j, k, g: r.g, minimum: r.qSum, maximum: r.cSum }; }
    }
    return { violation, witness, ok: violation <= TOL };
  }
  function grow(data, outer, inner) {
    const points = inner.map(clone);
    for (let j = 0; j < data.angles.length; j++) for (let k = 0; k < data.detector.length; k++) {
      const r = ray(data, outer, inner, j, k);
      r.p.forEach((interval, i) => {
        if (!interval || r.lower[i] <= 0) return;
        const a = interval[1] - r.lower[i], b = interval[0] + r.lower[i];
        if (b > a + 1e-10) points[i].push(G.pointOnLine(r.s, r.phi, a), G.pointOnLine(r.s, r.phi, b));
      });
    }
    return points.map(G.hull);
  }
  function solve(data, initialOuter, rounds = 3) {
    let outer = initialOuter.map(clone), inner = outer.map(() => []), states = [];
    for (let seed = 0; seed < 2; seed++) inner = grow(data, outer, inner);
    let check = audit(data, outer, inner);
    if (!check.ok) return { status: 'contradiction', check, outer, inner, states };
    if (!inner.every(G.full)) return { status: 'unresolved', check, outer, inner, states };
    const snapshot = (round, cuts) => {
      const output = outer.map((p, i) => G.midpoint(inner[i], p));
      states.push({ round, cuts, outer: outer.map(clone), inner: inner.map(clone), output,
        bound: G.enclosureBound(outer, inner), residual: residual(output, data).relative });
    };
    snapshot(0, 0);
    for (let round = 1; round <= rounds; round++) {
      let cuts = 0;
      for (let j = 0; j < data.angles.length; j++) for (let k = 0; k < data.detector.length; k++) {
        const r = ray(data, outer, inner, j, k);
        if (r.qSum > r.g + TOL || r.cSum < r.g - TOL) return { status: 'contradiction', check: { violation: Math.max(r.qSum-r.g, r.g-r.cSum), witness: {j,k,g:r.g,minimum:r.qSum,maximum:r.cSum} }, outer, inner, states };
        for (let i = 0; i < outer.length; i++) {
          if (r.known[i] <= 1e-7) continue;
          const [a, b] = r.q[i], upper = r.upper[i];
          for (const t of [b - upper - 2e-8, a + upper + 2e-8]) {
            const update = G.excludeShadow(outer[i], inner[i], G.pointOnLine(r.s, r.phi, t));
            if (update.changed) { outer[i] = update.polygon; cuts++; }
          }
        }
      }
      inner = grow(data, outer, inner);
      check = audit(data, outer, inner);
      if (!check.ok) return { status: 'contradiction', check, outer, inner, states };
      snapshot(round, cuts);
      if (!cuts) break;
    }
    return { status: 'compatible', check, outer, inner, states, output: states.at(-1).output,
      score: states.at(-1).residual, bound: states.at(-1).bound };
  }
  function normalizeCut(phi, offset) {
    while (phi < 0) { phi += Math.PI; offset *= -1; }
    while (phi >= Math.PI) { phi -= Math.PI; offset *= -1; }
    return { phi, offset };
  }
  function cutCandidate(data, global, phi, offset, rounds) {
    const cut = normalizeCut(phi, offset), n = G.direction(cut.phi);
    const initialOuter = [G.clip(global, n, cut.offset), G.clip(global, n.map(v => -v), -cut.offset)];
    if (!initialOuter.every(G.full)) return { ...cut, status: 'degenerate' };
    // Coincidence with the partition edge would double-count a shared chord.
    if (data.angles.some(a => Math.abs(Math.sin(a - cut.phi)) < 1e-10 &&
      data.detector.some(s => Math.abs(s - Math.cos(a - cut.phi) * cut.offset) < 1e-9))) return { ...cut, status: 'boundary-ray' };
    try { return { ...cut, initialOuter, ...solve(data, initialOuter, rounds) }; }
    catch (error) { return { ...cut, initialOuter, status: 'numerical-error', message: error.message }; }
  }
  function search(data, options = {}, progress = () => {}) {
    const config = { extent: 1.8, directions: 12, offsets: 17, rounds: 3, refinementLevels: 3, ...options };
    const global = globalOuter(data, config.extent), summaries = [], leaders = [], seen = new Set();
    let best = null;
    const tryCut = (phi, offset, phase) => {
      const normalized = normalizeCut(phi, offset), key = normalized.phi.toFixed(9)+':'+normalized.offset.toFixed(9);
      if (seen.has(key)) return; seen.add(key);
      const candidate = cutCandidate(data, global, phi, offset, config.rounds);
      candidate.id = summaries.length; candidate.phase = phase;
      summaries.push({ id: candidate.id, phi: candidate.phi, offset: candidate.offset, phase, status: candidate.status,
        score: candidate.score ?? null, bound: candidate.bound ?? null, violation: candidate.check?.violation ?? null });
      if (candidate.status === 'compatible') {
        leaders.push(candidate); leaders.sort((a,b) => a.score - b.score); if (leaders.length > 8) leaders.pop();
        if (!best || candidate.score < best.score) best = candidate;
      }
      if (summaries.length % 12 === 0) progress({ tried: summaries.length, best: best?.score ?? null, phase });
    };
    for (let a = 0; a < config.directions; a++) {
      const phi = a * Math.PI / config.directions, projection = global.map(v => G.dot(G.direction(phi), v));
      const lo = Math.min(...projection), hi = Math.max(...projection);
      for (let k = 1; k <= config.offsets; k++) tryCut(phi, lo + (hi-lo)*k/(config.offsets+1), 'coarse');
    }
    const diameter = 2 * config.extent;
    for (let level = 0; level < config.refinementLevels && best; level++) {
      const seeds = leaders.slice(0, 3);
      const da = Math.PI/config.directions / 3 ** (level + 1), ds = diameter/(config.offsets+1) / 3 ** (level + 1);
      for (const seed of seeds) for (const ia of [-1,0,1]) for (const is of [-2,-1,0,1,2])
        tryCut(seed.phi + ia*da, seed.offset + is*ds, 'refine-'+(level+1));
    }
    const counts = {};
    summaries.forEach(c => { counts[c.status] = (counts[c.status] || 0)+1; });
    return { status: best ? 'candidate-found' : 'no-candidate', config, global, candidates: summaries, counts, best,
      alternatives: leaders.slice(0, 4).map(c => ({id:c.id, phi:c.phi, offset:c.offset, score:c.score, output:c.output})),
      selection: 'Minimum measured total-sinogram relative L2 residual of midpoint output among numerically compatible candidates. No truth used.' };
  }
  return { unionLength, forward, residual, globalOuter, ray, audit, grow, solve, normalizeCut, cutCandidate, search };
});
