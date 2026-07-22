// Core Singularity atom-gain formula: g = m ** (1.02 * p)
// Direct port of singularity_sim/formula.py.

export const EXPONENT_MULTIPLIER = 1.02;

export function pChainProduct(factors) {
  return factors.reduce((a, b) => a * b, 1.0);
}

export function atomGain(m, factors = []) {
  if (!(m > 0)) throw new Error(`m must be positive, got ${m}`);
  return Math.pow(m, EXPONENT_MULTIPLIER * pChainProduct(factors));
}
