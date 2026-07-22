// Mult-goal path search: find the fastest (real-world time) sequence of
// Singularity Tree upgrades and Singularizations to reach a goal current
// Singularity Mult. Direct port of singularity_sim/path_search.py -- see
// that file's docstring for the two-phase algorithm (Phase 1: Dijkstra
// over upgrade-only prefixes + a grind-to-goal shortcut; Phase 2: greedy
// local-improvement pass inserting grinds / 3.1 / 3.2 purchases).
//
// The Dijkstra/beam engine itself lives in searchCore.js, shared with the
// push-target planner (pushPlanner.js) and the single-node rush planner
// (nodeRush.js). This file re-exports their public functions too, so every
// other module (app.js, optimizer.worker.js) can import any planner from
// "./pathSearch.js" without needing to know how the search code is split.

import { LogNum } from "./bignum.js?v=20260722b";
import { estimateTimeToNextSingularity, DEFAULT_SINGULARITY_REQUIREMENT } from "./growth.js?v=20260722b";
import { multAfterSingularize, totalMult } from "./singularize.js?v=20260722b";
import {
  MULT_BUCKET, roundTo, activeBonusKey, grindToGoal,
  searchUpgradePrefix, tryInsertImprovements,
} from "./searchCore.js?v=20260722b";

export {
  E308_PENALTY_NAME, E500_PENALTY_NAME, E1000_PENALTY_NAME,
  replayActionsPartial, grindRepeatCount,
} from "./searchCore.js?v=20260722b";
export { findPushPathVariants, expandPushPath, rankPushTreeUpgrades } from "./pushPlanner.js?v=20260722b";
export { findNodeRushPath, rankRushTreeUpgrades } from "./nodeRush.js?v=20260722b";

// grindToGoal memoized by (n1Level, n1Ascension, mult-bucket, unlocked-bonuses)
// -- improvement B. The outcome depends on STN 1.0's (level, ascension) AND the
// starting mult: Phase 1 holds mult fixed so a per-n1 entry sufficed there, but
// Phase 2 inserts grinds that raise mult before calling this, and a grind-to-goal
// from a higher mult is genuinely faster (and, with tarot bonuses, may cross a
// threshold that changes Total Mult). Keying on only (n1Level, n1Ascension) --
// as an earlier version did -- handed those raised-mult calls a stale, slower
// Phase 1 value, undervaluing grind insertions. Bucketing mult (and pinning the
// unlocked-bonus set) keeps the cache useful while costing Phase 2 honestly.
function makeCachedGrindToGoal(ctx, goal) {
  const cache = new Map();
  return function cachedGrindToGoal(state) {
    const key = `${state.n1Level},${state.n1Ascension},${roundTo(state.mult, MULT_BUCKET)},${activeBonusKey(state.mult, ctx)}`;
    if (!cache.has(key)) {
      const result = grindToGoal(state, ctx, goal);
      cache.set(key, result === null ? null : [result[0], result[1].mult]);
    }
    const cached = cache.get(key);
    if (cached === null) return null;
    const [dt, finalMult] = cached;
    return [dt, { ...state, mult: finalMult, atoms: ctx.baselineAtoms }];
  };
}

export function findOptimalPath({
  goal, startingMult, totalMultBase, initialTreeState,
  staticFactors = [], removedPenalties = [], baseOverrides = {},
  localSpeed = 2.34, currentAtoms = "1", maxIterations = 50_000, multBonuses = [],
  stn8 = 1, stn61 = 1, shopMultGainBonus = 1,
}) {
  const ctx = {
    totalMultBase, staticFactors, removedPenalties: new Set(removedPenalties),
    baseOverrides, localSpeed, baselineAtoms: LogNum.parse(currentAtoms),
    // (multThreshold, bonus) pairs -- tarot-style Total Mult bonuses (empty
    // leaves behavior unchanged). integralCache: mult-free growth K integrals.
    multBonuses, integralCache: new Map(),
    // STN 8 capstone multiplier on every node effect, and STN 6.1's divisor on
    // the Singularize mult-decay. Both default to 1 (nodes not owned). The
    // "Singularity Mult Gain" shop stat is a separate flat multiplier on the
    // Singularize gain, also defaulting to 1 (unbought).
    stn8, stn61, shopMultGainBonus,
  };

  const nodeState = (stnId) => initialTreeState[stnId] ?? [0, 0];
  const n1 = nodeState("1.0"), s31 = nodeState("3.1"), s32 = nodeState("3.2");
  const start = {
    n1Level: n1[0], n1Ascension: n1[1],
    s31Level: s31[0], s31Ascension: s31[1],
    s32Level: s32[0], s32Ascension: s32[1],
    mult: startingMult, atoms: ctx.baselineAtoms,
  };

  const cachedGrindToGoal = makeCachedGrindToGoal(ctx, goal);
  const phase1 = searchUpgradePrefix(start, ctx, goal, maxIterations, cachedGrindToGoal);

  if (!Number.isFinite(phase1.totalRealSeconds)) {
    return { reachable: false, goalReached: false, totalRealSeconds: 0, path: [], finalState: phase1.finalState };
  }

  const [total, path] = tryInsertImprovements(start, ctx, goal, phase1.path, phase1.totalRealSeconds, cachedGrindToGoal);
  const finalState = path.length ? path[path.length - 1][2] : start;

  return { reachable: true, goalReached: true, totalRealSeconds: total, path, finalState, ctx, start };
}

// Expand a found path's collapsed "grind_to_goal" steps into their
// individual Singularize cycles, so a plain list of atomic actions
// ("grind" | "upgrade_1.0" | "upgrade_3.1" | "upgrade_3.2") can be edited
// step-by-step in the UI.
export function expandPath(path, startingMult, ctx) {
  const out = [];
  let prevMult = startingMult;
  for (const [action, dt, state] of path) {
    if (action === "grind_to_goal") {
      out.push(...expandGrindToGoal(prevMult, state, ctx));
    } else {
      out.push([action, dt, state]);
    }
    prevMult = state.mult;
  }
  return out;
}

function expandGrindToGoal(prevMult, endState, ctx, maxCycles = 200_000) {
  let currentMult = prevMult;
  const rows = [];
  const multBonuses = ctx.multBonuses ?? [];
  while (currentMult < endState.mult - 1e-9 && rows.length < maxCycles) {
    const result = estimateTimeToNextSingularity({
      baseM: currentMult, targetAtoms: DEFAULT_SINGULARITY_REQUIREMENT,
      staticFactors: ctx.staticFactors, currentAtoms: ctx.baselineAtoms,
      removedPenalties: ctx.removedPenalties, penaltyOverrides: ctx.baseOverrides, localSpeed: ctx.localSpeed,
    });
    if (!result.reachable) break;
    // Total Mult recomputed each cycle so a tarot threshold crossed mid-grind
    // is reflected, exactly as the search's grind does.
    const tm = totalMult(ctx.totalMultBase, endState.n1Level, endState.n1Ascension, currentMult, multBonuses, ctx.stn8);
    currentMult = multAfterSingularize(tm, currentMult, ctx.stn61, ctx.shopMultGainBonus);
    rows.push(["grind", result.totalRealSeconds, { ...endState, mult: currentMult }]);
  }
  return rows;
}
