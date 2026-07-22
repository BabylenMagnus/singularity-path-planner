// Push-target planner: given one or more growing atom-target thresholds
// (10^x each, e.g. the atom requirements of the next Singularity counts),
// find the fastest chain of ordinary Sings + tree upgrades ending in one
// long grind ("final push") per target. Builds on searchCore.js's Dijkstra/
// beam engine; owns nothing about the mult-goal planner (pathSearch.js) or
// the single-node rush planner (nodeRush.js).

import { LogNum } from "./bignum.js?v=20260723a";
import {
  baseExponent, rn126Exponent, rn127Exponent, rn128Exponent,
  E10_PENALTY_NAME, E50_PENALTY_NAME, E154_PENALTY_NAME,
} from "./atomPenalties.js?v=20260723a";
import { realSecondsFromIntegral } from "./growth.js?v=20260723a";
import {
  multAfterSingularize, totalMult, weakenedPenaltyExponent,
  nodeEffect, stn8Multiplier,
} from "./singularize.js?v=20260723a";
import {
  E1000_PENALTY_NAME, PUSH_MAX_SINGS, ATOMS_LOG10_BUCKET, MULT_BUCKET, roundTo,
  growthIntegral, activeBonusKey, getSingTrajectory, applyGrinds,
  penaltyOverridesFor, grindToGoalStep, searchUpgradePrefix, tryInsertImprovements,
  evaluateSequence, n1Score,
} from "./searchCore.js?v=20260723a";

// Push-mode tree search is dominated by shortcut evals; a modest iteration
// cap keeps UI snappy. Mult-goal findOptimalPath still uses the full budget.
const PUSH_MAX_ITERATIONS = 800;
const PUSH_PHASE2_ROUNDS = 24;
const PUSH_PHASE2_BEAM = 2;
const PUSH_PHASE2_PATIENCE = 1;
// When sing_only already wants this many sings, tree search must avoid
// re-walking a new 1e5 mult trajectory per node1 upgrade (profile wall).
const PUSH_DEEP_SINGS = 4_000;
const PUSH_DEEP_MAX_ITERATIONS = 200;
const PUSH_DEEP_PHASE2_ROUNDS = 8;
const PUSH_DEEP_MAX_N1_BUYS = 4;
// Collapse N plain sings into one action `grind_xN` above this (UI/replay).
const GRIND_COMPACT_THRESHOLD = 64;

// From `state`, decide how many plain Sings to do before pushing to
// 10^exponent. Total cost is unimodal in sing count.
// Uses mult-free growth integrals + shared sing trajectories.
// Search: exponential upper-bound + integer ternary min (not a full O(k) scan).
function bestSingsThenPush(state, ctx, exponent, { maxSings = PUSH_MAX_SINGS } = {}) {
  const overrides = penaltyOverridesFor(state, ctx);
  const atomsAreBase = state.atoms.log10 === ctx.baselineAtoms.log10;
  const pushKBase = growthIntegral(ctx, ctx.baselineAtoms, overrides, `e${exponent}`);
  const pushK0 = atomsAreBase
    ? pushKBase
    : growthIntegral(ctx, state.atoms, overrides, `e${exponent}`);

  const realDt = (entry, mult) => {
    if (!entry.reachable) return null;
    return realSecondsFromIntegral(entry.K, mult, ctx.localSpeed);
  };
  const afterPushMult = (m) => {
    const tm = totalMult(ctx.totalMultBase, state.n1Level, state.n1Ascension, m, ctx.multBonuses, ctx.stn8);
    return multAfterSingularize(tm, m, ctx.stn61, ctx.shopMultGainBonus);
  };

  let best = null;
  const consider = (traj, k, cost) => {
    if (cost === null) return;
    if (best !== null && !(cost < best.total - 1e-9)) return;
    const multBefore = k === 0 ? state.mult : traj.multAfter[k];
    const pushDt = k === 0 ? cost : cost - traj.singCost[k];
    best = {
      total: cost,
      sings: k,
      pushDt,
      endState: { ...state, mult: afterPushMult(multBefore), atoms: ctx.baselineAtoms },
    };
  };

  const push0 = realDt(pushK0, state.mult);
  if (push0 !== null) {
    consider({ multAfter: [state.mult], singCost: [0] }, 0, push0);
  }
  if (!pushKBase.reachable && best === null) return null;

  const costAt = (traj, k) => {
    if (k === 0) return push0;
    if (k > traj.len) return null;
    const pdt = realDt(pushKBase, traj.multAfter[k]);
    if (pdt === null) return null;
    return traj.singCost[k] + pdt;
  };

  // Double hi until cumulative sing time alone exceeds best total (or maxSings).
  let hi = 0;
  for (let step = 1; hi < maxSings; step *= 2) {
    const cand = Math.min(maxSings, Math.max(hi + 1, step));
    const traj = getSingTrajectory(ctx, state, cand, maxSings);
    if (traj.len === 0) break;
    hi = traj.len;
    consider(traj, hi, costAt(traj, hi));
    if (best && traj.singCost[hi] >= best.total) break;
    if (hi >= maxSings) break;
    if (cand >= maxSings) break;
  }
  if (hi <= 0) return best;

  const traj = getSingTrajectory(ctx, state, hi, maxSings);
  hi = Math.min(hi, traj.len);

  // Integer ternary on [0, hi].
  let L = 0, R = hi;
  while (R - L > 4) {
    const m1 = L + ((R - L) / 3 | 0);
    const m2 = R - ((R - L) / 3 | 0);
    const c1 = costAt(traj, m1);
    const c2 = costAt(traj, m2);
    if (c1 === null && c2 === null) break;
    if (c1 === null) L = m1;
    else if (c2 === null) R = m2;
    else if (c1 < c2) R = m2;
    else L = m1;
  }
  for (let k = L; k <= R; k++) consider(traj, k, costAt(traj, k));
  return best;
}

// Memoized sings-then-push for one target, playing cachedGrindToGoal's role
// in the search. Keyed by the full tree state (the push time depends on
// 3.1/3.2, not just node1), plus bucketed mult/atoms and unlocked bonuses.
// Returns [total, endState, {sings, pushDt}] so expand can skip a rescan.
function makeCachedSingsThenPush(ctx, exponent) {
  const cache = new Map();
  return function cachedSingsThenPush(state) {
    const key = [
      state.n1Level, state.n1Ascension, state.s31Level, state.s31Ascension,
      state.s32Level, state.s32Ascension,
      roundTo(state.mult, MULT_BUCKET), roundTo(state.atoms.log10, ATOMS_LOG10_BUCKET),
      activeBonusKey(state.mult, ctx),
    ].join(",");
    if (!cache.has(key)) cache.set(key, bestSingsThenPush(state, ctx, exponent));
    const best = cache.get(key);
    if (best === null) return null;
    return [best.total, best.endState, { sings: best.sings, pushDt: best.pushDt }];
  };
}

// Find paths through a SEQUENCE of push targets (10^x each, e.g. the growing
// atom requirements of Singularity #53, #54, ...). Each segment is optimized
// from the previous segment's end state. Returns up to three variants sharing
// one ctx (and its caches):
//   sing_only  -- no tree upgrades: per segment, optimal sing count then push;
//   optimal    -- per segment, the same two-phase search as findOptimalPath,
//                 with the sings-then-push shortcut playing grind_to_goal's role;
//   tree_heavy -- per segment, the optimal prefix plus one extra purchase of
//                 whichever node hurts least (the price of over-investing).
export function findPushPathVariants({
  pushExponents, startingMult, totalMultBase, initialTreeState,
  staticFactors = [], removedPenalties = [], baseOverrides = {},
  localSpeed = 2.34, currentAtoms = "1", maxIterations = 50_000, multBonuses = [],
  stn8 = 1, stn61 = 1, shopMultGainBonus = 1,
}) {
  const ctx = {
    totalMultBase, staticFactors, removedPenalties: new Set(removedPenalties),
    baseOverrides, localSpeed, baselineAtoms: LogNum.parse(currentAtoms),
    multBonuses, integralCache: new Map(),
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

  // One memoized shortcut per target, shared by every variant.
  const shortcuts = pushExponents.map((exp) => makeCachedSingsThenPush(ctx, exp));
  const variants = [];

  // sing_only: chain of pure sings-then-push segments.
  let maxSingsSeen = 0;
  {
    let state = start, total = 0, ok = true;
    const segments = [];
    for (let seg = 0; seg < pushExponents.length; seg++) {
      const shortcut = shortcuts[seg](state);
      if (!shortcut) { ok = false; break; }
      const [dt, endState, meta] = shortcut;
      if (meta && meta.sings > maxSingsSeen) maxSingsSeen = meta.sings;
      total += dt;
      segments.push({ exponent: pushExponents[seg], path: [grindToGoalStep(dt, endState, meta)] });
      state = endState;
    }
    if (ok) variants.push({ name: "sing_only", totalRealSeconds: total, segments });
  }

  // Deep push (huge sings-before-push): limit node1 branching + iters so we
  // don't rebuild 1e5 mult trajectories per n1 level (bench hotspot).
  const deep = maxSingsSeen >= PUSH_DEEP_SINGS;
  const pushIters = Math.min(maxIterations, deep ? PUSH_DEEP_MAX_ITERATIONS : PUSH_MAX_ITERATIONS);
  const phase2Rounds = deep ? PUSH_DEEP_PHASE2_ROUNDS : PUSH_PHASE2_ROUNDS;
  const choiceOpts = deep
    ? { deepPush: true, n1StartScore: n1Score(start), maxN1Buys: PUSH_DEEP_MAX_N1_BUYS }
    : null;

  // optimal: per segment, Phase 1 Dijkstra over upgrade prefixes + Phase 2
  // beam, closed by that segment's shortcut. goal = Infinity so the
  // mult-based early exits never fire.
  const optimalSegments = [];
  {
    let state = start, total = 0, ok = true;
    for (let seg = 0; seg < pushExponents.length; seg++) {
      const phase1 = searchUpgradePrefix(state, ctx, Infinity, pushIters, shortcuts[seg], choiceOpts);
      if (!Number.isFinite(phase1.totalRealSeconds)) { ok = false; break; }
      const [segTotal, segPath] = tryInsertImprovements(
        state, ctx, Infinity, phase1.path, phase1.totalRealSeconds, shortcuts[seg],
        1e-9, phase2Rounds, PUSH_PHASE2_BEAM, PUSH_PHASE2_PATIENCE,
      );
      optimalSegments.push({ exponent: pushExponents[seg], path: segPath, startState: state });
      total += segTotal;
      state = segPath[segPath.length - 1][2];
    }
    if (ok) variants.push({ name: "optimal", totalRealSeconds: total, segments: optimalSegments });
  }

  // tree_heavy: replay the optimal plan per segment but append one extra
  // upgrade (best of the three nodes) before each segment's closing push.
  if (optimalSegments.length === pushExponents.length) {
    let state = start, total = 0, ok = true;
    const segments = [];
    for (let seg = 0; seg < pushExponents.length; seg++) {
      const baseActions = optimalSegments[seg].path.filter((s) => s[0] !== "grind_to_goal").map((s) => s[0]);
      const base = evaluateSequence(baseActions, state, ctx, shortcuts[seg]);
      let bestExtra = null;
      for (const stnId of ["1.0", "3.1", "3.2"]) {
        const evaluated = evaluateSequence([...baseActions, `upgrade_${stnId}`], state, ctx, shortcuts[seg]);
        if (evaluated && (bestExtra === null || evaluated[0] < bestExtra[0])) bestExtra = evaluated;
      }
      // Take the extra upgrade when it costs at most +25% on the segment --
      // this variant deliberately over-invests in the tree.
      let best = base;
      if (bestExtra && (base === null || bestExtra[0] <= base[0] * 1.25)) best = bestExtra;
      if (!best) { ok = false; break; }
      segments.push({ exponent: pushExponents[seg], path: best[1] });
      total += best[0];
      state = best[1][best[1].length - 1][2];
    }
    if (ok) variants.push({ name: "tree_heavy", totalRealSeconds: total, segments });
  }

  return { reachable: variants.length > 0, variants, ctx, start };
}

// Nodes the user can force-level for "which tree buy helps this push most?".
// Planner never buys 6.1/6.2/8 mid-path; this ranks a hypothetical +1 each.
const TREE_RANK_NODES = ["1.0", "3.1", "3.2", "6.1", "6.2", "8.0"];

function cloneTreeState(tree) {
  const out = {};
  for (const id of Object.keys(tree)) out[id] = [...(tree[id] ?? [0, 0])];
  return out;
}

/** +1 level on stnId (auto-ascend at 10). Returns { tree, from, to }. */
function bumpTreeNode(tree, stnId) {
  const next = cloneTreeState(tree);
  let [level, ascension] = next[stnId] ?? [0, 0];
  const from = { level, ascension };
  level += 1;
  if (level >= 10) { level = 1; ascension += 1; }
  next[stnId] = [level, ascension];
  return { tree: next, from, to: { level, ascension } };
}

function formatAscLevel(level, ascension) {
  return `${ascension}:${level}`;
}

/**
 * Rank a single +1 purchase on each tree node by how much it shortens the
 * push to pushExponents (best of findPushPathVariants). totalMultBase must be
 * the underlying base (shown TM / (node1 * stn8)), not the live shown TM.
 *
 * Does NOT model upgrade cost — only in-push time savings.
 */
export function rankPushTreeUpgrades({
  pushExponents, startingMult, totalMultBase, initialTreeState,
  staticFactors = [], removedPenalties = [],
  localSpeed = 2.34, currentAtoms = "1", maxIterations = 50_000, multBonuses = [],
  shopMultGainBonus = 1, relic69Bonus = null,
  rn126Level = 0, rn127Level = 0, rn128Level = 0,
}) {
  const baseTree = cloneTreeState(initialTreeState);

  function runPush(tree) {
    const stn8 = stn8Multiplier(...(tree["8.0"] ?? [0, 0]));
    // Match app.js: 6.1 effect is not multiplied by STN8 in the planner form.
    const stn61 = nodeEffect("6.1", ...(tree["6.1"] ?? [0, 0]));
    const [s62Level, s62Ascension] = tree["6.2"] ?? [0, 0];
    const baseOverrides = {
      [E1000_PENALTY_NAME]: weakenedPenaltyExponent(
        baseExponent(E1000_PENALTY_NAME), "6.2", s62Level, s62Ascension, stn8,
      ),
      [E50_PENALTY_NAME]: rn126Exponent(rn126Level),
      [E154_PENALTY_NAME]: rn127Exponent(rn127Level),
      [E10_PENALTY_NAME]: rn128Exponent(rn128Level),
    };
    if (relic69Bonus != null) baseOverrides.relic_69_bonus = relic69Bonus;

    const res = findPushPathVariants({
      pushExponents,
      startingMult,
      totalMultBase,
      initialTreeState: tree,
      staticFactors,
      removedPenalties,
      baseOverrides,
      localSpeed,
      currentAtoms,
      maxIterations,
      multBonuses,
      stn8,
      stn61,
      shopMultGainBonus,
    });
    if (!res.reachable || !res.variants.length) {
      return { reachable: false, totalRealSeconds: null, bestVariant: null };
    }
    let best = res.variants[0];
    for (const v of res.variants) {
      if (v.totalRealSeconds < best.totalRealSeconds) best = v;
    }
    return { reachable: true, totalRealSeconds: best.totalRealSeconds, bestVariant: best.name };
  }

  const baseline = runPush(baseTree);
  const rankings = [];

  for (const stnId of TREE_RANK_NODES) {
    const { tree, from, to } = bumpTreeNode(baseTree, stnId);
    const bumped = runPush(tree);
    const saved = (baseline.reachable && bumped.reachable)
      ? baseline.totalRealSeconds - bumped.totalRealSeconds
      : null;
    rankings.push({
      stnId,
      fromLabel: formatAscLevel(from.level, from.ascension),
      toLabel: formatAscLevel(to.level, to.ascension),
      label: `STN ${stnId} ${formatAscLevel(from.level, from.ascension)} → ${formatAscLevel(to.level, to.ascension)}`,
      reachable: bumped.reachable,
      totalRealSeconds: bumped.totalRealSeconds,
      bestVariant: bumped.bestVariant,
      savedSeconds: saved,
    });
  }

  rankings.sort((a, b) => {
    const as = a.savedSeconds, bs = b.savedSeconds;
    if (as == null && bs == null) return 0;
    if (as == null) return 1;
    if (bs == null) return -1;
    return bs - as;
  });

  return {
    reachable: baseline.reachable,
    baselineSeconds: baseline.totalRealSeconds,
    baselineVariant: baseline.bestVariant,
    pushExponents: [...pushExponents],
    rankings,
  };
}

// Expand a push-variant's segments into atomic rows: each segment's collapsed
// "grind_to_goal" becomes sings as "grind" / "grind_xN" plus one "final_push".
// Prefer sings/pushDt embedded in the path step (from the search cache).
// Large sing counts collapse to grind_xN so the UI doesn't hold 1e5 rows.
export function expandPushPath(segments, start, ctx) {
  const out = [];
  let prevState = start;
  for (const { exponent, path } of segments) {
    for (const step of path) {
      const [action, dt, state, singsMeta, pushDtMeta] = step;
      if (action === "grind_to_goal") {
        let sings = singsMeta;
        let pushDt = pushDtMeta;
        let endState = state;
        if (sings == null || pushDt == null) {
          const best = bestSingsThenPush(prevState, ctx, exponent);
          if (!best) return out;
          sings = best.sings;
          pushDt = best.pushDt;
          endState = best.endState;
        }
        if (sings > 0) {
          const batch = applyGrinds(prevState, ctx, sings);
          if (!batch) return out;
          const [singDt, afterSings] = batch;
          if (sings >= GRIND_COMPACT_THRESHOLD) {
            out.push([`grind_x${sings}`, singDt, afterSings]);
          } else {
            const traj = getSingTrajectory(ctx, prevState, sings, Math.max(sings, PUSH_MAX_SINGS));
            for (let k = 1; k <= sings; k++) {
              out.push(["grind", traj.singCost[k] - traj.singCost[k - 1], {
                ...prevState,
                mult: traj.multAfter[k],
                atoms: ctx.baselineAtoms,
              }]);
            }
          }
          prevState = afterSings;
        }
        out.push(["final_push", pushDt, endState]);
        prevState = endState;
      } else {
        out.push([action, dt, state]);
        prevState = state;
      }
    }
  }
  return out;
}
