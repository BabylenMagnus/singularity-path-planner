// Singularity Tree Node (STN) cost mechanics. Direct port of
// singularity_sim/tree.py for the 3 confirmed nodes (1.0/3.1/3.2); the other
// 10 use an ESTIMATED base cost (see NOTES/gaps.md #7) as a default that the
// UI lets the player override once they read a real number off the game.

import { LogNum } from "./bignum.js?v=20260723a";

// All 13 nodes share the same step formula (baseAtomCostStep=e5,
// costStepIncreasePerAscend=e5 -- confirmed identical across 1.0/3.1/3.2
// despite their different (a,p,b) effect params), so only baseAtomCost
// varies per node. The 10 `confirmed: false` entries use a linear-per-tier
// guess fit through the 3 known points (tier 1 = e300, tier 3 = e420 ->
// +60/tier) -- see NOTES/gaps.md #7 for the full derivation. Treat these as
// placeholders, not ground truth.
const STEP = LogNum.parse("e5");
const ASCEND_STEP = LogNum.parse("e5");

export const STN_DEFINITIONS = {
  "1.0": { baseAtomCost: LogNum.parse("e300"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 6, level 4 ->
  // next cost 1.00e567): backsolved baseAtomCost = 567 - 35*4 = e427. Was a
  // e360 guess (linear-per-tier fit through 1.0=e300/3.1-3.2=e420) -- the
  // real value is HIGHER than tier 3's e420, breaking that linear-tier
  // assumption entirely (see NOTES/gaps.md #7 for what this means for the
  // other 8 still-unconfirmed nodes).
  "2.0": { baseAtomCost: LogNum.parse("e427"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  "3.1": { baseAtomCost: LogNum.parse("e420"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  "3.2": { baseAtomCost: LogNum.parse("e420"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 8, level 7 ->
  // next cost 1.00e732): backsolved baseAtomCost = 732 - 45*7 = e417. Was an
  // e480 guess -- the real value is LOWER than tier 3's e420 too (not just
  // below the tier-4 guess), further confirming cost doesn't track tier
  // position monotonically (see 2.0's e427 above and NOTES/gaps.md #7).
  "4.1": { baseAtomCost: LogNum.parse("e417"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 3, level 1 ->
  // next cost 1.00e495): backsolved baseAtomCost = 495 - 20*1 = e475. Was an
  // e480 guess (close by luck -- 4.1's e417 in the SAME tier shows the guess
  // method isn't reliable even when a number happens to land nearby).
  "4.2": { baseAtomCost: LogNum.parse("e475"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // Confirmed 2026-07-22 from a real in-game reading (ascension 1, level 7 ->
  // next cost 1.00e660): backsolved baseAtomCost = 660 - 10*7 = e590. Was an
  // e540 guess.
  "5.1": { baseAtomCost: LogNum.parse("e590"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  // --- 5.2/6.1/7.1/7.2 are UNCONFIRMED. Re-derived 2026-07-23 after the old
  // global "+60/tier" fit (through only 1.0 and 3.1/3.2) was disproven by
  // real readings that don't move monotonically by tier at all (see
  // NOTES/gaps.md #7). Method: nearest-known extrapolation instead of a
  // single global line -- 5.2 borrows its known tier-mate 5.1 (e590) as-is;
  // 6.1 borrows its known tier-mate 6.2 (e773) as-is; 7.1/7.2 have no known
  // tier-mate, so they get tier 6's value (773) plus a step recomputed from
  // the two most recent CONFIRMED tiers (tier 5 avg 590 -> tier 6's 773 is a
  // +183 step): 773 + 183 = 956. Still just a guess -- replace with a real
  // reading (tree-editor-panel's "Next level cost" field) whenever you have
  // one, same as the confirmed nodes above/below.
  "5.2": { baseAtomCost: LogNum.parse("e590"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: false },
  "6.1": { baseAtomCost: LogNum.parse("e773"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: false },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 4, level 7 ->
  // next cost 1.00e948): backsolved baseAtomCost = 948 - 25*7 = e773.
  "6.2": { baseAtomCost: LogNum.parse("e773"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: true },
  "7.1": { baseAtomCost: LogNum.parse("e956"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: false },
  "7.2": { baseAtomCost: LogNum.parse("e956"), baseAtomCostStep: STEP, costStepIncreasePerAscend: ASCEND_STEP, confirmed: false },
  // Confirmed 2026-07-23 from a real in-game reading (ascension 0, level 3 ->
  // next cost 1.00e1030): backsolved baseAtomCost = 1030 - 5*3 = e1015 (at
  // ascension 0 the effective step is just baseAtomCostStep=e5, unscaled).
  // Was an e1022 guess -- close, and it also confirms the guess chain's step
  // (734 -> 878, both derived from the pre-8.0 known tiers) still holds since
  // regenerating with 8.0 now known leaves 5.2/6.1/6.2/7.1/7.2 unchanged (the
  // propagation only looks backward from each unknown tier).
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
