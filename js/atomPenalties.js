// Atom-amount-gated buffs/penalties on Atom Gain.
// Direct port of singularity_sim/atom_penalties.py.

import { LogNum } from "./bignum.js?v=20260723c";

export const RELIC_69_LEVEL_SLOPE = 0.0066;

export function relic69LevelBonus(level) {
  if (level < 0) throw new Error(`level must be non-negative, got ${level}`);
  return 1 + RELIC_69_LEVEL_SLOPE * level;
}

// name, atomRequirement, exponent, removedBy (Refine Node opt-out), weakenedBy (STN, unquantified here)
export const ATOM_THRESHOLD_PENALTIES = [
  { name: "relic_69_bonus", atomRequirement: LogNum.parse("1e6"), exponent: 1.0, removedBy: null, weakenedBy: null },
  { name: "penalty_1e10", atomRequirement: LogNum.parse("1.00e10"), exponent: 0.5, removedBy: "RN128", weakenedBy: null },
  { name: "penalty_1e50", atomRequirement: LogNum.parse("1.00e50"), exponent: 5 / 6, removedBy: "RN126", weakenedBy: null },
  { name: "penalty_1e154", atomRequirement: LogNum.parse("1.00e154"), exponent: 0.8475, removedBy: "RN127", weakenedBy: null },
  { name: "penalty_1_6e256", atomRequirement: LogNum.parse("1.60e256"), exponent: 5 / 7, removedBy: null, weakenedBy: null },
  { name: "penalty_1_798e308", atomRequirement: LogNum.parse("1.798e308"), exponent: 0.125, removedBy: null, weakenedBy: "STN 3.1" },
  { name: "penalty_1e500", atomRequirement: LogNum.parse("1.00e500"), exponent: 0.05, removedBy: null, weakenedBy: "STN 3.2" },
  { name: "penalty_1e1000", atomRequirement: LogNum.parse("1e1000"), exponent: 0.033, removedBy: null, weakenedBy: "STN 6.2" },
  { name: "penalty_1e2000", atomRequirement: LogNum.parse("1e2000"), exponent: 0.5, removedBy: null, weakenedBy: null },
  { name: "penalty_1e3000", atomRequirement: LogNum.parse("1e3000"), exponent: 1 / 3, removedBy: null, weakenedBy: null },
  { name: "penalty_1e5000", atomRequirement: LogNum.parse("1e5000"), exponent: 0.2, removedBy: null, weakenedBy: null },
  { name: "penalty_1e10000", atomRequirement: LogNum.parse("e10000"), exponent: 0.1, removedBy: null, weakenedBy: null },
];

export function baseExponent(name) {
  const pen = ATOM_THRESHOLD_PENALTIES.find((p) => p.name === name);
  if (!pen) throw new Error(`unknown penalty ${name}`);
  return pen.exponent;
}

export const E10_PENALTY_NAME = "penalty_1e10";
export const E50_PENALTY_NAME = "penalty_1e50";
export const E154_PENALTY_NAME = "penalty_1e154";

// Refine Nodes RN126/127/128/131 are leveled 0-10, not simple "owned" toggles
// (confirmed against the community "Singularity Time Spender" spreadsheet,
// which reverse-engineered these against the live game). Each formula reduces
// to the un-upgraded ATOM_THRESHOLD_PENALTIES exponent at level 0, so these
// overrides can always be applied -- no separate "removed" boolean needed.
// Exponents are clamped to 1 (fully removed is the ceiling; the raw formulas
// overshoot past 1 above the node's real in-game max level).
export function rn126Exponent(level) {
  return Math.min(1, 1 - (1 - level) / 6);
}
export function rn127Exponent(level) {
  return Math.min(1, 1 - 0.153 * (1 - level));
}
export function rn128Exponent(level) {
  return Math.min(1, 0.5 + 0.05 * level);
}
// RN131's Atom Gain buff scales with both Singularity Count and the node's
// own level (not a fixed count/200 -- that was the level=1 special case).
export function rn131Factor(singularityCount, level) {
  return 1 + 0.005 * singularityCount * level;
}

export function effectiveExponent(pen, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, pen.name)) return overrides[pen.name];
  return pen.exponent;
}

export function activePenaltyExponents(currentAtoms, removed = [], overrides = {}) {
  const atoms = currentAtoms instanceof LogNum ? currentAtoms : LogNum.fromValue(currentAtoms);
  const removedSet = new Set(removed);
  const out = [];
  for (const pen of ATOM_THRESHOLD_PENALTIES) {
    const exponent = effectiveExponent(pen, overrides);
    if (exponent === null || exponent === undefined) continue;
    if (atoms.lt(pen.atomRequirement)) continue;
    if (pen.removedBy && removedSet.has(pen.removedBy)) continue;
    out.push(exponent);
  }
  return out;
}
