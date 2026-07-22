// Single-node rush planner: fastest way to bring ONE tree node to a target
// (ascension, level), optionally buying accelerator nodes or Singularizing
// along the way.
//
// STN 1.0/3.1/3.2 (RUSH_NODE_FIELDS) go through searchCore's shared
// NODE_FIELDS/upgrade/upgradeChoices unchanged -- they're the only nodes
// that also feed the mult/penalty formulas, so the OTHER planners
// (mult-goal, push) already search over them too.
//
// Any other node (2.0, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.0) has no
// modeled effect on growth (NOTES/gaps.md), so it never needs to be a shared
// searchCore choice -- extending NODE_FIELDS to all 13 would only inflate
// the branching factor of every OTHER planner for zero benefit. Instead
// those targets get one extra local state field (targetLevel/targetAscension)
// and one extra local edge (upgradeTarget), tracked only inside this file.

import { LogNum } from "./bignum.js?v=20260722b";
import { MinHeap, grind, upgrade, upgradeChoices, visitedKey, project, penaltyOverridesFor, E1000_PENALTY_NAME } from "./searchCore.js?v=20260722b";
import { nextUpgradeCost } from "./tree.js?v=20260722b";
import { weakenedPenaltyExponent, stn8Multiplier, nodeEffect } from "./singularize.js?v=20260722b";
import { baseExponent, rn126Exponent, rn127Exponent, rn128Exponent, E10_PENALTY_NAME, E50_PENALTY_NAME, E154_PENALTY_NAME } from "./atomPenalties.js?v=20260722b";

const RUSH_NODE_FIELDS = {
  "1.0": ["n1Level", "n1Ascension"],
  "3.1": ["s31Level", "s31Ascension"],
  "3.2": ["s32Level", "s32Ascension"],
};

function isStandardNode(stnId) {
  return stnId in RUSH_NODE_FIELDS;
}

function nodeRushScore(state, stnId, targetIsStandard) {
  if (targetIsStandard) {
    const [levelField, ascField] = RUSH_NODE_FIELDS[stnId];
    return state[ascField] * 9 + state[levelField];
  }
  return state.targetAscension * 9 + state.targetLevel;
}

// Buy the (non-standard) target node's next level. Mirrors searchCore's
// upgrade() exactly (grind first if atoms are short, then spend) but reads
// state.targetLevel/targetAscension instead of a NODE_FIELDS entry, and
// honors an optional cost override (a plain log10 number -- see tree.js).
function upgradeTarget(stnId, state, ctx, baseCostOverrideLog10) {
  const level = state.targetLevel, ascension = state.targetAscension;
  const cost = nextUpgradeCost(stnId, level, ascension, baseCostOverrideLog10);

  let atoms = state.atoms;
  let timeSeconds = 0;
  if (atoms.lt(cost)) {
    const result = project(ctx, state.mult, atoms, penaltyOverridesFor(state, ctx), cost);
    if (!result.reachable) return null;
    timeSeconds = result.totalRealSeconds;
    atoms = result.finalAtoms;
  }

  const newAtoms = atoms.div(cost);
  let newLevel = level + 1, newAscension = ascension;
  if (newLevel >= 10) { newLevel = 1; newAscension = ascension + 1; }
  return [timeSeconds, { ...state, targetLevel: newLevel, targetAscension: newAscension, atoms: newAtoms }];
}

// searchCore's visitedKey doesn't know about targetLevel/targetAscension
// (only n1/s31/s32/atoms) -- for a non-standard target, states that differ
// only in the target node's progress would otherwise collide as "visited".
function nodeRushVisitedKey(state, targetIsStandard) {
  const base = visitedKey(state);
  return targetIsStandard ? base : `${base}|${state.targetLevel},${state.targetAscension}`;
}

// Find the fastest way to bring ONE tree node to a target (ascension, level).
// Unlike findOptimalPath's mult-goal search, there's no cheap "shortcut" for
// a level target, so this is a plain Dijkstra with grind as a real edge (not
// just a Phase-2 insertion) -- exact, not approximated, but can be slow for
// very deep targets (many ascensions out); capped by maxIterations like the
// rest of the planner.
export function findNodeRushPath({
  targetStnId, targetLevel, targetAscension,
  startingMult, totalMultBase, initialTreeState,
  staticFactors = [], removedPenalties = [], baseOverrides = {},
  localSpeed = 2.34, currentAtoms = "1", maxIterations = 50_000, multBonuses = [],
  stn8 = 1, stn61 = 1, shopMultGainBonus = 1,
  targetCostOverrideLog10 = null,
}) {
  const ctx = {
    totalMultBase, staticFactors, removedPenalties: new Set(removedPenalties),
    baseOverrides, localSpeed, baselineAtoms: LogNum.parse(currentAtoms),
    multBonuses, integralCache: new Map(),
    stn8, stn61, shopMultGainBonus,
  };

  const targetIsStandard = isStandardNode(targetStnId);
  const nodeState = (stnId) => initialTreeState[stnId] ?? [0, 0];
  const n1 = nodeState("1.0"), s31 = nodeState("3.1"), s32 = nodeState("3.2");
  let start = {
    n1Level: n1[0], n1Ascension: n1[1],
    s31Level: s31[0], s31Ascension: s31[1],
    s32Level: s32[0], s32Ascension: s32[1],
    mult: startingMult, atoms: ctx.baselineAtoms,
  };
  if (!targetIsStandard) {
    const t = nodeState(targetStnId);
    start = { ...start, targetLevel: t[0], targetAscension: t[1] };
  }

  const scoreOf = (state) => nodeRushScore(state, targetStnId, targetIsStandard);
  const targetScore = targetAscension * 9 + targetLevel;
  if (scoreOf(start) >= targetScore) {
    return { reachable: true, totalRealSeconds: 0, path: [], finalState: start, ctx, start };
  }

  let counter = 0;
  const heap = new MinHeap();
  heap.push([0, counter++, start, []]);
  const visited = new Map();

  let iterations = 0;
  while (heap.size > 0 && iterations < maxIterations) {
    iterations++;
    const [g, , state, path] = heap.pop();

    const key = nodeRushVisitedKey(state, targetIsStandard);
    if (visited.has(key) && visited.get(key) <= g) continue;
    visited.set(key, g);

    // Dijkstra invariant: the first pop satisfying the target has the
    // smallest possible g among all states reaching it (edges are >= 0).
    if (scoreOf(state) >= targetScore) {
      return { reachable: true, totalRealSeconds: g, path, finalState: state, ctx, start };
    }

    // Non-standard targets deliberately do NOT offer 1.0/3.1/3.2 as
    // alternative moves: those don't affect the target node's own cost
    // formula (tree.js -- it only depends on the target's own ascension:level),
    // and letting the search buy an unbounded number of them as a "maybe this
    // helps Mult a little" side option blows up the branching factor combinatorially
    // on deep targets (millions of iterations without converging). Grind + buy-
    // target is the only real tradeoff for this search, and it's what actually
    // determines the fastest path.
    const choices = targetIsStandard
      ? ["grind", ...upgradeChoices(state)]
      : ["grind", "upgrade_target"];
    for (const choice of choices) {
      const result = choice === "grind" ? grind(state, ctx)
        : choice === "upgrade_target" ? upgradeTarget(targetStnId, state, ctx, targetCostOverrideLog10)
        : upgrade(choice, state, ctx);
      if (!result) continue;
      const [dt, newState] = result;
      const newG = g + dt;
      const newKey = nodeRushVisitedKey(newState, targetIsStandard);
      if (visited.has(newKey) && visited.get(newKey) <= newG) continue;
      // Recorded action name must match what searchCore.js's replay dispatcher
      // (stepAction) expects for a scenario card to replay correctly later:
      // "grind" as-is, every upgrade prefixed "upgrade_<id>" (standard nodes
      // dispatch to upgrade(), non-standard ones to upgradeGeneric() -- see
      // stepAction). "upgrade_target" is this file's own internal choice name
      // for the rushed non-standard node; recorded as "upgrade_<targetStnId>".
      const recordedAction = choice === "grind" ? choice
        : choice === "upgrade_target" ? `upgrade_${targetStnId}`
        : `upgrade_${choice}`;
      heap.push([newG, counter++, newState, [...path, [recordedAction, dt, newState]]]);
    }
  }

  return { reachable: false, totalRealSeconds: null, path: [], finalState: null, ctx, start };
}

// Nodes worth ranking as a hypothetical pre-investment before a rush: the 3
// that weaken atom penalties (3.1/3.2/6.2, faster growth in every future
// grind, not just this rush), 6.1 (faster Mult gain per Sing), 1.0 (raises
// Total Mult directly), and 8.0 (multiplies every other node's own effect).
// The node actually being rushed is excluded by the caller -- "what if I
// already had 8.0 further along" is circular when 8.0 IS the target.
const RUSH_RANK_NODES = ["1.0", "3.1", "3.2", "6.1", "6.2", "8.0"];

function cloneTreeState(tree) {
  const out = {};
  for (const id of Object.keys(tree)) out[id] = [...(tree[id] ?? [0, 0])];
  return out;
}

// +1 full ascension on stnId (not +1 level -- see nodeRush's own analysis:
// a node's effect is 1 + a*ascension^p + b*level/(ascension+1), so at a high
// ascension the level term is diluted almost to nothing by that denominator.
// An ascension bump is the only change that reliably moves the needle, so
// it's the one worth showing the player). Lands on level 1 of the next
// ascension, mirroring the real auto-ascend wrap (tree.js advanceByBuys).
function bumpTreeNodeAscension(tree, stnId) {
  const next = cloneTreeState(tree);
  const [level, ascension] = next[stnId] ?? [0, 0];
  next[stnId] = [1, ascension + 1];
  return { tree: next, from: { level, ascension }, to: { level: 1, ascension: ascension + 1 } };
}

function baseOverridesForTree(tree, rn126Level, rn127Level, rn128Level, relic69Bonus) {
  const stn8 = stn8Multiplier(...(tree["8.0"] ?? [0, 0]));
  const [s62Level, s62Ascension] = tree["6.2"] ?? [0, 0];
  const overrides = {
    [E1000_PENALTY_NAME]: weakenedPenaltyExponent(baseExponent(E1000_PENALTY_NAME), "6.2", s62Level, s62Ascension, stn8),
    [E50_PENALTY_NAME]: rn126Exponent(rn126Level),
    [E154_PENALTY_NAME]: rn127Exponent(rn127Level),
    [E10_PENALTY_NAME]: rn128Exponent(rn128Level),
  };
  if (relic69Bonus != null) overrides.relic_69_bonus = relic69Bonus;
  return overrides;
}

// Ranks hypothetical pre-investments for the CURRENT "Rush a tree node"
// target: a +1 ascension bump on each of RUSH_RANK_NODES (excluding the
// target itself), plus a flat "Mult +100" row, all compared against the
// unmodified baseline rush. Purchase cost of the bump is NOT included --
// same convention as pushPlanner.js's "Rank tree for push" -- this answers
// "how much faster does the rush become afterward", not "is it worth
// buying" (that's a separate, much bigger atom-cost question the player
// weighs themselves against the seconds saved shown here).
export function rankRushTreeUpgrades({
  targetStnId, targetLevel, targetAscension,
  startingMult, totalMultBase, initialTreeState,
  staticFactors = [], removedPenalties = [],
  localSpeed = 2.34, currentAtoms = "1", maxIterations = 50_000, multBonuses = [],
  shopMultGainBonus = 1, relic69Bonus = null,
  rn126Level = 0, rn127Level = 0, rn128Level = 0,
  targetCostOverrideLog10 = null,
  multBonusPercent = 0.10,
}) {
  const baseTree = cloneTreeState(initialTreeState);

  function runRush(tree, mult) {
    const stn8 = stn8Multiplier(...(tree["8.0"] ?? [0, 0]));
    const stn61 = nodeEffect("6.1", ...(tree["6.1"] ?? [0, 0]));
    const res = findNodeRushPath({
      targetStnId, targetLevel, targetAscension,
      startingMult: mult, totalMultBase, initialTreeState: tree,
      staticFactors, removedPenalties,
      baseOverrides: baseOverridesForTree(tree, rn126Level, rn127Level, rn128Level, relic69Bonus),
      localSpeed, currentAtoms, maxIterations, multBonuses,
      stn8, stn61, shopMultGainBonus, targetCostOverrideLog10,
    });
    return res.reachable
      ? { reachable: true, totalRealSeconds: res.totalRealSeconds }
      : { reachable: false, totalRealSeconds: null };
  }

  const baseline = runRush(baseTree, startingMult);
  const rankings = [];

  for (const stnId of RUSH_RANK_NODES) {
    if (stnId === targetStnId) continue;
    const { tree, from, to } = bumpTreeNodeAscension(baseTree, stnId);
    const bumped = runRush(tree, startingMult);
    const saved = (baseline.reachable && bumped.reachable)
      ? baseline.totalRealSeconds - bumped.totalRealSeconds
      : null;
    rankings.push({
      label: `STN ${stnId} ${from.ascension}:${from.level} → ${to.ascension}:${to.level}`,
      reachable: bumped.reachable,
      totalRealSeconds: bumped.totalRealSeconds,
      savedSeconds: saved,
    });
  }

  // Mult +N% as a directly comparable alternative lever (no tree change) --
  // relative, not a flat step, since a fixed +100 means very different things
  // at Mult 300 vs Mult 30000. Scales with the player's actual current Mult.
  const multTarget = startingMult * (1 + multBonusPercent);
  const bumpedMult = runRush(baseTree, multTarget);
  const savedMult = (baseline.reachable && bumpedMult.reachable)
    ? baseline.totalRealSeconds - bumpedMult.totalRealSeconds
    : null;
  rankings.push({
    label: `Mult +${Math.round(multBonusPercent * 100)}% (${startingMult.toFixed(2)} → ${multTarget.toFixed(2)})`,
    reachable: bumpedMult.reachable,
    totalRealSeconds: bumpedMult.totalRealSeconds,
    savedSeconds: savedMult,
  });

  rankings.sort((a, b) => (b.savedSeconds ?? -Infinity) - (a.savedSeconds ?? -Infinity));

  return {
    reachable: baseline.reachable,
    baselineSeconds: baseline.totalRealSeconds,
    rankings,
  };
}
