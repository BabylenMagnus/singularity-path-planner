// Singularity Tree Node (STN) cost mechanics. Direct port of
// singularity_sim/tree.py for the 3 confirmed nodes (1.0/3.1/3.2). The other
// 10 are now ALSO confirmed from real in-game readings (2026-07-23) -- every
// node in the tree has a real baseAtomCost, no guesses left. See the
// backsolve math below each entry.
//
// Reading format from the player: "A-B -> N" means ascension A, level B,
// shown next-upgrade-cost with total log10 exponent N (a bare "AeB" reading
// like "10e567" must first be corrected to log10 = B + log10(A) = 568 --
// the mantissa is NOT the exponent, confirmed by the player's own "100e798
// то есть 800" = 798 + log10(100) = 800).

import { LogNum } from "./bignum.js?v=20260723b";

// costStepIncreasePerAscend=e5 is shared across every node (confirmed
// identical for 1.0/3.1/3.2 from the python source, and consistent with
// every node backsolved below). baseAtomCostStep, however, is NOT shared --
// node 2.0 proved this (see its entry): its own step is e12, not e5. Nodes
// with only a single real reading keep the e5 default since a single
// (base, step) pair can't be solved from one equation; treat those as the
// best available fit, not verified ground truth, until a second same-
// ascension reading at a different level pins the step down like it did
// for 2.0.
const STEP = LogNum.parse("e5");
const ASCEND_STEP = LogNum.parse("e5");

export const STN_DEFINITIONS = {
  "1.0": { baseAtomCost: LogNum.parse("e300"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from TWO real readings at the SAME ascension (6):
  // level 4 -> e568 (10e567 corrected), level 5 -> e610. Their difference
  // (610-568=42) IS the node's real effectiveStep at ascension 6 -- but the
  // shared formula predicts baseStep(e5)+ascend(6*e5)=35, a 7-off mismatch.
  // Solving with costStepIncreasePerAscend still shared at e5 (confirmed
  // elsewhere): baseAtomCostStep = 42 - 6*5 = e12, not e5. Then
  // baseAtomCost = 568 - 42*4 = 610 - 42*5 = e400 (both levels agree
  // exactly). This is the proof that baseAtomCostStep is per-node, like
  // baseAtomCost itself, not a shared e5 constant.
  "2.0": { baseAtomCost: LogNum.parse("e400"), baseAtomCostStep: LogNum.parse("e12"), costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  "3.1": { baseAtomCost: LogNum.parse("e420"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  "3.2": { baseAtomCost: LogNum.parse("e420"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 8, level 7 ->
  // next cost e732, already a bare exponent, no mantissa correction needed):
  // backsolved baseAtomCost = 732 - 45*7 = e417 (using the shared e5/e5 step
  // since only one reading exists for this node).
  "4.1": { baseAtomCost: LogNum.parse("e417"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 3, level 1 ->
  // next cost e496, corrected from "10e495"): backsolved baseAtomCost =
  // 496 - 20*1 = e476.
  "4.2": { baseAtomCost: LogNum.parse("e476"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 1, level 7 ->
  // next cost 1.00e660, a bare exponent): backsolved baseAtomCost =
  // 660 - 10*7 = e590.
  "5.1": { baseAtomCost: LogNum.parse("e590"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 1, level 6 ->
  // next cost e640, corrected from "10e639"): backsolved baseAtomCost =
  // 640 - 10*6 = e580.
  "5.2": { baseAtomCost: LogNum.parse("e580"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 1, level 2 ->
  // next cost e640, corrected from "10e639"): backsolved baseAtomCost =
  // 640 - 10*2 = e620.
  "6.1": { baseAtomCost: LogNum.parse("e620"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 4, level 7 ->
  // next cost e950, corrected from "100e948"): backsolved baseAtomCost =
  // 950 - 25*7 = e775.
  "6.2": { baseAtomCost: LogNum.parse("e775"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading at LEVEL 0 (ascension 1,
  // level 0 -> next cost e800, "100e798 то есть 800" -- player did the
  // mantissa correction themselves). Level 0 means cost = baseAtomCost
  // exactly (effectiveStep^0 = 1), so this is an exact reading, no step
  // assumption involved at all.
  "7.1": { baseAtomCost: LogNum.parse("e800"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 0, level 3 ->
  // next cost e830, corrected from "100e828"): backsolved baseAtomCost =
  // 830 - 5*3 = e815 (ascension 0 -> effectiveStep is just baseAtomCostStep
  // unscaled).
  "7.2": { baseAtomCost: LogNum.parse("e815"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 0, level 3 ->
  // next cost 1030, a bare exponent): backsolved baseAtomCost =
  // 1030 - 5*3 = e1015.
  "8.0": { baseAtomCost: LogNum.parse("e1015"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
};

export function hasConfirmedCost(stnId) {
  return !!STN_DEFINITIONS[stnId]?.confirmed;
}

// Plain log10 default for a confirmed node -- used as ground truth input to
// regenerateCostGuesses (below), same shape as backsolveBaseCostLog10's
// output so both feed the same "known" map.
export function defaultBaseAtomCostLog10(stnId) {
  return STN_DEFINITIONS[stnId].baseAtomCost.log10;
}

// The tree's linear chain (NOTES/model.md "Layout"), grouped by tier --
// nodes in the same tier are the ones that were assumed (before 2026-07-22)
// to share a cost; some do (3.1/3.2), some don't (4.1 vs 4.2).
export const COST_CHAIN = [
  ["1.0"], ["2.0"], ["3.1", "3.2"], ["4.1", "4.2"],
  ["5.1", "5.2"], ["6.1", "6.2"], ["7.1", "7.2"], ["8.0"],
];

// Re-derive a baseAtomCost guess (log10) for every node NOT present in
// `known` (a { [stnId]: log10 } map of real values -- confirmed defaults and/
// or player-entered corrections), from nearest-known-tier extrapolation:
// each unconfirmed tier's value is the last known tier's value plus a step
// recomputed from the two MOST RECENT tiers that had a known value (falls
// back to the historical +60 guess step until at least two tiers are known),
// carried forward through any run of consecutive unknown tiers. A node with
// no reading of its own but a known tier-mate (e.g. 5.2 next to a known 5.1)
// borrows that tier-mate's value directly instead of an averaged guess --
// see NOTES/gaps.md #7 for why this replaced a single global linear fit
// (which could never place a node outside the range of its two anchors, and
// two real readings did exactly that).
export function regenerateCostGuesses(known) {
  const tierAvg = COST_CHAIN.map((tier) => {
    const vals = tier.map((id) => known[id]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  let lastKnownAvg = null, step = 60;
  const propagated = new Array(COST_CHAIN.length).fill(null);
  for (let i = 0; i < COST_CHAIN.length; i++) {
    if (tierAvg[i] != null) {
      if (lastKnownAvg != null) step = tierAvg[i] - lastKnownAvg;
      propagated[i] = tierAvg[i];
    } else {
      propagated[i] = (lastKnownAvg ?? propagated[i - 1] ?? 300) + step;
    }
    lastKnownAvg = propagated[i];
  }

  const guesses = {};
  COST_CHAIN.forEach((tier, i) => {
    for (const id of tier) {
      if (known[id] != null) continue;
      const mate = tier.find((sib) => sib !== id && known[sib] != null);
      guesses[id] = mate != null ? known[mate] : propagated[i];
    }
  });
  return guesses;
}

function effectiveStepFor(def, ascensionCount) {
  let step = def.baseAtomCostStep;
  if (ascensionCount > 0) step = step.mul(def.costStepIncreasePerAscend.pow(ascensionCount));
  return step;
}

// cost(level -> level+1) = base_atom_cost * effective_step ** level, where
// effective_step = base_atom_cost_step * cost_step_increase_per_ascend ** ascension_count.
// baseCostOverrideLog10, when given, replaces def.baseAtomCost for this call
// only (a plain log10 number, not a LogNum, so it survives the worker
// postMessage boundary -- see NOTES/architecture.md) -- used when the player
// enters a real "cost shown in-game" number for an unconfirmed node.
export function nextUpgradeCost(stnId, level, ascensionCount, baseCostOverrideLog10 = null) {
  const def = STN_DEFINITIONS[stnId];
  if (level >= 10) throw new Error(`STN ${stnId} is at level ${level}, must Ascend before buying more levels`);
  if (ascensionCount < 0) throw new Error("ascension_count must be non-negative");
  const effectiveStep = effectiveStepFor(def, ascensionCount);
  const baseCost = baseCostOverrideLog10 != null ? new LogNum(baseCostOverrideLog10) : def.baseAtomCost;
  return baseCost.mul(effectiveStep.pow(level));
}

// Back-solve baseCost (as a log10 number) from a "next upgrade cost" the
// player reads off the game right now, at the node's CURRENT level/ascension
// -- same backsolve pattern app.js already uses for totalMultBase from the
// shown Total Mult. Returns a plain number, not a LogNum.
export function backsolveBaseCostLog10(stnId, level, ascensionCount, shownCostLog10) {
  const def = STN_DEFINITIONS[stnId];
  const effectiveStep = effectiveStepFor(def, ascensionCount);
  return shownCostLog10 - effectiveStep.pow(level).log10;
}

// Where would (level, ascension) land after n more purchases? Mirrors
// searchCore.js's upgrade() auto-ascend rule (level 9 -> next buy wraps to
// level 1, ascension+1) exactly, so "+N" quick-fill buttons in the UI match
// what the search engine will actually do.
export function advanceByBuys(level, ascension, n) {
  let lvl = level, asc = ascension;
  for (let i = 0; i < n; i++) {
    lvl += 1;
    if (lvl >= 10) { lvl = 1; asc += 1; }
  }
  return [lvl, asc];
}
