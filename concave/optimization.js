/* A finite, exhaustively evaluated cut optimization. No phantom input. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.CutOptimization = factory(root.ConcaveGeometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const perimeter = polygon => polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }, 0);
  function grid(config) {
    const cuts = [];
    const last = Math.floor(config.offsetLimit / config.offsetStep + 1e-9);
    for (let j = 0; j < config.directions; j++) {
      const phi = j * Math.PI / config.directions;
      for (let k = -last; k <= last; k++) cuts.push({ phi, offset: k * config.offsetStep });
    }
    return cuts;
  }
  function optimize(data, options = {}, progress = () => {}) {
    const config = { extent: 1.8, directions: 24, offsetStep: 0.05,
      offsetLimit: 1.6, rounds: 3, fidelitySlack: 1e-4, ...options };
    if (!Number.isInteger(config.directions) || config.directions < 1 ||
      !Number.isInteger(config.rounds) || config.rounds < 0 ||
      !Number.isFinite(config.extent) || config.extent <= 0 ||
      !Number.isFinite(config.offsetStep) || config.offsetStep <= 0 ||
      !Number.isFinite(config.offsetLimit) || config.offsetLimit < 0 ||
      !Number.isFinite(config.fidelitySlack) || config.fidelitySlack < 0)
      throw Error('Invalid optimization grid or fidelity slack');
    const global = C.globalOuter(data, config.extent), cuts = grid(config);
    const candidates = [], feasible = [];
    let minimumResidual = Infinity;
    for (let i = 0; i < cuts.length; i++) {
      const { phi, offset } = cuts[i];
      const result = C.cutCandidate(data, global, phi, offset, config.rounds);
      const row = { id: i, phi, offset, status: result.status,
        residual: result.status === 'compatible' ? result.score : null,
        perimeter: result.status === 'compatible' ? result.output.reduce((s, p) => s + perimeter(p), 0) : null,
        violation: result.check?.violation ?? null };
      candidates.push(row);
      if (result.status === 'compatible' && Number.isFinite(row.residual) && Number.isFinite(row.perimeter)) {
        feasible.push(row); minimumResidual = Math.min(minimumResidual, row.residual);
      }
      if ((i + 1) % 48 === 0) progress({ tried: i + 1, total: cuts.length, feasible: feasible.length,
        minimumResidual: Number.isFinite(minimumResidual) ? minimumResidual : null });
    }
    const admissible = feasible.filter(c => c.residual <= minimumResidual + config.fidelitySlack + 1e-14);
    admissible.sort((a, b) => a.perimeter - b.perimeter || a.residual - b.residual || a.id - b.id);
    const fidelityWinner = feasible.reduce((best, c) => !best || c.residual < best.residual ? c : best, null);
    const selected = admissible[0] ?? null;
    const best = selected ? { ...C.cutCandidate(data, global, selected.phi, selected.offset, config.rounds), id: selected.id,
      perimeter: selected.perimeter } : null;
    const counts = {}; candidates.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    progress({ tried: cuts.length, total: cuts.length, feasible: feasible.length,
      minimumResidual: Number.isFinite(minimumResidual) ? minimumResidual : null });
    return { version: 3, status: best ? 'candidate-found' : 'no-candidate', config, global,
      candidates, counts, minimumResidual: Number.isFinite(minimumResidual) ? minimumResidual : null,
      fidelityWinner, admissibleCount: admissible.length, best,
      guarantee: 'Exact minimizer of reconstructed-piece perimeter among candidates on this fixed grid with residual at most the finite-grid minimum plus fidelitySlack. No continuous-cut or true-shape optimality claim.' };
  }
  return { perimeter, grid, optimize };
});
