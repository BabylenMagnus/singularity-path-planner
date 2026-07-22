// Runs the path optimizer off the main thread so the UI doesn't freeze during
// a search. It does BOTH findOptimalPath and expandPath here and returns only
// plain serializable data ([action, dt, mult] triples + scalars), so no LogNum
// instances have to survive structured-clone across the worker boundary.
import {
  findOptimalPath, expandPath, findPushPathVariants, expandPushPath,
  rankPushTreeUpgrades, findNodeRushPath, rankRushTreeUpgrades, E1000_PENALTY_NAME,
} from "./pathSearch.js?v=20260723b";
import { weakenedPenaltyExponent } from "./singularize.js?v=20260723b";
import {
  baseExponent, rn126Exponent, rn127Exponent, rn128Exponent,
  E10_PENALTY_NAME, E50_PENALTY_NAME, E154_PENALTY_NAME,
} from "./atomPenalties.js?v=20260723b";

// E308/E500 weakening is recomputed from the live tree state inside the
// search (3.1/3.2 are purchasable); E1000's comes from STN 6.2 and E10/E50/
// E154's from RN128/126/127, none of which the planner ever buys mid-path,
// so they're fixed config baked into the base overrides.
function buildBaseOverrides(stats) {
  const overrides = {};
  if (stats.relic69Bonus != null) overrides.relic_69_bonus = stats.relic69Bonus;
  const [s62Level, s62Ascension] = stats.treeState["6.2"] ?? [0, 0];
  overrides[E1000_PENALTY_NAME] = weakenedPenaltyExponent(baseExponent(E1000_PENALTY_NAME), "6.2", s62Level, s62Ascension, stats.stn8);
  overrides[E50_PENALTY_NAME] = rn126Exponent(stats.rn126Level ?? 0);
  overrides[E154_PENALTY_NAME] = rn127Exponent(stats.rn127Level ?? 0);
  overrides[E10_PENALTY_NAME] = rn128Exponent(stats.rn128Level ?? 0);
  return overrides;
}

function optimize(stats, goal) {
  const res = findOptimalPath({
    goal,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    removedPenalties: stats.removedPenalties,
    baseOverrides: buildBaseOverrides(stats),
    localSpeed: stats.localSpeed,
    maxIterations: stats.maxIterations,
    multBonuses: stats.multBonuses,
    stn8: stats.stn8,
    stn61: stats.stn61,
    shopMultGainBonus: stats.shopMultGainBonus,
  });
  if (!res.reachable) {
    return { reachable: false, totalRealSeconds: res.totalRealSeconds, finalStateMult: res.finalState.mult };
  }
  const expanded = expandPath(res.path, stats.startingMult, res.ctx)
    .map(([action, dt, state]) => [action, dt, state.mult]);
  return { reachable: true, totalRealSeconds: res.totalRealSeconds, finalStateMult: res.finalState.mult, expanded };
}

function optimizePush(stats, pushExponents) {
  const res = findPushPathVariants({
    pushExponents,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    removedPenalties: stats.removedPenalties,
    baseOverrides: buildBaseOverrides(stats),
    localSpeed: stats.localSpeed,
    maxIterations: stats.maxIterations,
    multBonuses: stats.multBonuses,
    stn8: stats.stn8,
    stn61: stats.stn61,
    shopMultGainBonus: stats.shopMultGainBonus,
  });
  if (!res.reachable) return { reachable: false };
  const variants = res.variants.map((v) => ({
    name: v.name,
    totalRealSeconds: v.totalRealSeconds,
    expanded: expandPushPath(v.segments, res.start, res.ctx).map(([action, dt, state]) => [action, dt, state.mult]),
  }));
  return { reachable: true, variants };
}

function rankTreeForPush(stats, pushExponents) {
  // Cap iters so 7 full push solves stay interactive; still enough for ranking.
  // Was 2_500 -- too low for a deep node-rush target (a multi-ascension jump
  // needs ~50_000+ to even find a path at all, see rankTreeForRush below) and
  // silently reported "unreachable" no matter how high the player set the
  // form's own Max search iterations field, since this cap always won via
  // Math.min. 60_000 keeps 7 reruns interactive while actually covering that.
  const maxIterations = Math.min(stats.maxIterations || 50_000, 60_000);
  return rankPushTreeUpgrades({
    pushExponents,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    removedPenalties: stats.removedPenalties,
    localSpeed: stats.localSpeed,
    maxIterations,
    multBonuses: stats.multBonuses,
    shopMultGainBonus: stats.shopMultGainBonus,
    relic69Bonus: stats.relic69Bonus ?? null,
    rn126Level: stats.rn126Level ?? 0,
    rn127Level: stats.rn127Level ?? 0,
    rn128Level: stats.rn128Level ?? 0,
  });
}

function rushNode(stats, rushTarget) {
  const res = findNodeRushPath({
    targetStnId: rushTarget.stnId,
    targetLevel: rushTarget.level,
    targetAscension: rushTarget.ascension,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    removedPenalties: stats.removedPenalties,
    baseOverrides: buildBaseOverrides(stats),
    localSpeed: stats.localSpeed,
    maxIterations: stats.maxIterations,
    multBonuses: stats.multBonuses,
    stn8: stats.stn8,
    stn61: stats.stn61,
    shopMultGainBonus: stats.shopMultGainBonus,
    targetCostOverrideLog10: rushTarget.costOverrideLog10 ?? null,
  });
  if (!res.reachable) return { reachable: false };
  const expanded = res.path.map(([action, dt, state]) => [action, dt, state.mult]);
  return { reachable: true, totalRealSeconds: res.totalRealSeconds, expanded };
}

function rankTreeForRush(stats, rushTarget) {
  // Same interactivity budget as rankTreeForPush -- 7 hypothetical reruns
  // (6 nodes + Mult) don't need the full search budget to converge. Was
  // 2_500: confirmed via a direct findNodeRushPath repro (2026-07-22) that a
  // 2-ascension rush target needs ~50_000 iterations to find ANY path (a
  // 20-step path, once found, isn't itself slow) -- 2_500 made this mode
  // always report "unreachable" for any target that deep, regardless of what
  // the player set in the form's Max search iterations field.
  const maxIterations = Math.min(stats.maxIterations || 50_000, 60_000);
  return rankRushTreeUpgrades({
    targetStnId: rushTarget.stnId,
    targetLevel: rushTarget.level,
    targetAscension: rushTarget.ascension,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    removedPenalties: stats.removedPenalties,
    localSpeed: stats.localSpeed,
    maxIterations,
    multBonuses: stats.multBonuses,
    shopMultGainBonus: stats.shopMultGainBonus,
    relic69Bonus: stats.relic69Bonus ?? null,
    rn126Level: stats.rn126Level ?? 0,
    rn127Level: stats.rn127Level ?? 0,
    rn128Level: stats.rn128Level ?? 0,
    targetCostOverrideLog10: rushTarget.costOverrideLog10 ?? null,
  });
}

self.onmessage = (e) => {
  const { id, stats, goal, mode, pushExponents, rushTarget } = e.data;
  try {
    let result;
    if (mode === "push") result = optimizePush(stats, pushExponents);
    else if (mode === "rank-tree-push") result = rankTreeForPush(stats, pushExponents);
    else if (mode === "rush-node") result = rushNode(stats, rushTarget);
    else if (mode === "rank-tree-rush") result = rankTreeForRush(stats, rushTarget);
    else result = optimize(stats, goal);
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: err.message });
  }
};
