// Compound-growth atom accumulation and time-to-next-Singularity estimation.
// Direct port of singularity_sim/growth.py.

import { LogNum } from "./bignum.js?v=20260723c";
import { ATOM_THRESHOLD_PENALTIES, activePenaltyExponents, effectiveExponent } from "./atomPenalties.js?v=20260723c";
import { EXPONENT_MULTIPLIER, atomGain, pChainProduct } from "./formula.js?v=20260723c";

export const DEFAULT_SINGULARITY_REQUIREMENT = LogNum.parse("1e308");

export function formatExponent(x) {
  let s = x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

export class CompoundGrowthProjector {
  constructor({
    baseM,
    staticFactors = [],
    removedPenalties = new Set(),
    penaltyOverrides = {},
    currentAtoms,
    localSpeed = 2.34,
  }) {
    this.baseM = baseM;
    this.staticFactors = staticFactors;
    this.removedPenalties = removedPenalties instanceof Set ? removedPenalties : new Set(removedPenalties);
    this.penaltyOverrides = penaltyOverrides;
    this.currentAtoms = currentAtoms instanceof LogNum ? currentAtoms : LogNum.fromValue(currentAtoms);
    this.localSpeed = localSpeed;
    // Per-instance p-chain memo (improvement D). staticFactors/removedPenalties/
    // penaltyOverrides are fixed for a projector's life, so currentP depends only
    // on the Atom total -- keyed by its exact log10, so no approximation. Within
    // one milestonesToTarget this halves the calls: each segment's post-jump newP
    // is the same boundary the next segment then reads as its starting p.
    this._pCache = new Map();
  }

  currentP(atAtoms = null) {
    const atoms = atAtoms ?? this.currentAtoms;
    const cached = this._pCache.get(atoms.log10);
    if (cached !== undefined) return cached;
    const factors = [...this.staticFactors, ...activePenaltyExponents(atoms, this.removedPenalties, this.penaltyOverrides)];
    const p = pChainProduct(factors);
    this._pCache.set(atoms.log10, p);
    return p;
  }

  perSecondLog10(p) {
    return EXPONENT_MULTIPLIER * p * Math.log10(this.baseM);
  }

  nextThreshold(after) {
    // Penalties are ordered by atomRequirement; take the first still-ahead.
    for (const pen of ATOM_THRESHOLD_PENALTIES) {
      const exp = effectiveExponent(pen, this.penaltyOverrides);
      if (exp === null || exp === undefined) continue;
      if (!pen.atomRequirement.gt(after)) continue;
      if (pen.removedBy && this.removedPenalties.has(pen.removedBy)) continue;
      return pen;
    }
    return null;
  }

  milestonesToTarget(targetAtoms, maxSegments = 64) {
    const target = LogNum.parse(targetAtoms);
    let current = this.currentAtoms;
    const milestones = [];
    let totalGameSeconds = 0;

    if (current.gte(target)) {
      return {
        reachable: true, milestones: [],
        totalGameSeconds: 0, totalRealSeconds: 0, finalAtoms: current,
      };
    }

    for (let i = 0; i < maxSegments; i++) {
      const p = this.currentP(current);
      const perSecond = this.perSecondLog10(p);
      if (perSecond <= 0) {
        return {
          reachable: false, milestones,
          totalGameSeconds: null, totalRealSeconds: null, finalAtoms: current,
        };
      }

      const nextThresh = this.nextThreshold(current);
      const boundary = nextThresh === null
        ? target
        : (target.log10 <= nextThresh.atomRequirement.log10 ? target : nextThresh.atomRequirement);
      const isFinal = boundary.gte(target);

      const deltaLog10 = boundary.log10 - current.log10;
      const secondsNeeded = deltaLog10 <= 0 ? 0 : deltaLog10 / perSecond;
      totalGameSeconds += secondsNeeded;
      current = boundary;

      const realSeconds = totalGameSeconds / this.localSpeed;
      const crossedExponent = isFinal ? null : effectiveExponent(nextThresh, this.penaltyOverrides);
      const newP = isFinal ? p : this.currentP(current);

      milestones.push({
        name: isFinal ? "target" : nextThresh.name,
        label: isFinal ? "target" : `^${formatExponent(crossedExponent)}`,
        exponent: crossedExponent,
        atomRequirement: boundary,
        gameSeconds: totalGameSeconds,
        realSeconds,
        gainPerSecond: atomGain(this.baseM, [newP]),
      });

      if (isFinal || current.gte(target)) {
        return {
          reachable: true, milestones,
          totalGameSeconds, totalRealSeconds: realSeconds, finalAtoms: current,
        };
      }
    }

    return {
      reachable: false, milestones,
      totalGameSeconds: null, totalRealSeconds: null, finalAtoms: current,
    };
  }

  // Path integral K such that gameSeconds = K / log10(baseM).
  // pen/p-chain depends only on atom thresholds, not mult, so K is mult-free.
  // Searching over many mults reuses one K (huge win for push-path scans).
  growthIntegralK(targetAtoms, maxSegments = 64) {
    const target = LogNum.parse(targetAtoms);
    let current = this.currentAtoms;
    if (current.gte(target)) {
      return { reachable: true, K: 0, finalAtoms: current };
    }
    let K = 0;
    for (let i = 0; i < maxSegments; i++) {
      const p = this.currentP(current);
      if (!(p > 0)) {
        return { reachable: false, K: null, finalAtoms: current };
      }
      const nextThresh = this.nextThreshold(current);
      const boundary = nextThresh === null
        ? target
        : (target.log10 <= nextThresh.atomRequirement.log10 ? target : nextThresh.atomRequirement);
      const deltaLog10 = boundary.log10 - current.log10;
      // gameSeconds_segment = delta / (EXP * p * log10(m))  →  K += delta / (EXP * p)
      if (deltaLog10 > 0) K += deltaLog10 / (EXPONENT_MULTIPLIER * p);
      current = boundary;
      if (current.gte(target)) {
        return { reachable: true, K, finalAtoms: target };
      }
    }
    return { reachable: false, K: null, finalAtoms: current };
  }
}

// Real-time seconds to grow from currentAtoms → target at baseM, via K/log10(m).
export function realSecondsFromIntegral(K, baseM, localSpeed) {
  if (K === 0) return 0;
  const logM = Math.log10(baseM);
  if (!(logM > 0) || !(localSpeed > 0)) return null;
  return K / (logM * localSpeed);
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "unreachable";
  if (Number.isNaN(seconds) || seconds < 0) throw new Error(`invalid seconds value: ${seconds}`);
  if (seconds > 1e12) {
    const years = seconds / 31_557_600;
    return `~${years.toExponential(3)} years`;
  }
  const units = [["d", 86400], ["h", 3600], ["m", 60]];
  let remaining = seconds;
  const parts = [];
  for (const [suffix, size] of units) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count}${suffix}`);
      remaining -= count * size;
    }
  }
  if (remaining > 0 || parts.length === 0) {
    parts.push(Number.isInteger(remaining) ? `${remaining}s` : `${remaining.toFixed(2)}s`);
  }
  return parts.join(" ");
}

export function estimateTimeToNextSingularity({
  baseM, targetAtoms, staticFactors = [], currentAtoms = "1",
  removedPenalties = [], penaltyOverrides = {}, localSpeed = 2.34,
}) {
  const projector = new CompoundGrowthProjector({
    baseM, staticFactors, removedPenalties: new Set(removedPenalties),
    penaltyOverrides, currentAtoms: LogNum.parse(currentAtoms), localSpeed,
  });
  const result = projector.milestonesToTarget(targetAtoms);
  result.localSpeed = localSpeed;
  return result;
}
