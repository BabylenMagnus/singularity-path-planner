// Shared search engine used by every planner (mult-goal in pathSearch.js,
// push-target chains in pushPlanner.js, single-node rush in nodeRush.js):
// the Dijkstra/beam machinery over tree-upgrade purchases, the atomic-action
// replay dispatcher (stepAction/replayActionsPartial), and the low-level
// growth-integral projection atoms are built on. No planner-specific code
// lives here -- if a planner needs it, it's exported; everything stays a
// closed, cycle-free dependency (planners import this, never the reverse).

import { LogNum } from "./bignum.js?v=20260723c";
import { CompoundGrowthProjector, DEFAULT_SINGULARITY_REQUIREMENT, realSecondsFromIntegral } from "./growth.js?v=20260723c";
import { multAfterSingularize, totalMult, weakenedPenaltyExponent } from "./singularize.js?v=20260723c";
import { baseExponent } from "./atomPenalties.js?v=20260723c";
import { nextUpgradeCost } from "./tree.js?v=20260723c";

export const E308_PENALTY_NAME = "penalty_1_798e308";
export const E500_PENALTY_NAME = "penalty_1e500";
export const E1000_PENALTY_NAME = "penalty_1e1000";

// Per the original tool: don't branch into "upgrade STN 3.2" until buying
// STN 1.0 or STN 3.1's next level would cost more than this.
const STN32_GATE_THRESHOLD = LogNum.parse("1e500");

// Hard ceiling on sings-before-push scan (and trajectory length).
export const PUSH_MAX_SINGS = 200_000;

const NODE_FIELDS = {
  "1.0": ["n1Level", "n1Ascension"],
  "3.1": ["s31Level", "s31Ascension"],
  "3.2": ["s32Level", "s32Ascension"],
};

export function isStandardNode(stnId) {
  return stnId in NODE_FIELDS;
}

function spend(atoms, cost) {
  if (cost.gt(atoms)) throw new Error(`cannot spend ${cost} from smaller wallet ${atoms}`);
  return atoms.div(cost);
}

// Bucketing granularities for the integral cache and the grind-to-goal cache
// (improvement B) -- a hair of precision traded for cache hits, consistent
// with visitedKey's existing atom rounding.
export const ATOMS_LOG10_BUCKET = 3;
export const TARGET_LOG10_BUCKET = 6;
export const MULT_BUCKET = 4;
export const roundTo = (x, decimals) => Math.round(x * 10 ** decimals) / 10 ** decimals;

function overridesSignature(overrides) {
  // Fixed-key join (no Object.keys sort) — overrides are small and stable.
  let s = "";
  for (const k in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, k)) s += k + ":" + overrides[k] + "|";
  }
  return s;
}

// Growth time factors as K / log10(mult): pen path is mult-independent, so one
// integral serves every mult (push-scan and Dijkstra shortcuts). Cached on ctx
// by (atoms, overrides, target) — not by mult.
export function growthIntegral(ctx, currentAtoms, overrides, target) {
  const targetLn = LogNum.parse(target);
  const atoms = currentAtoms instanceof LogNum ? currentAtoms : LogNum.parse(currentAtoms);
  const key = [
    roundTo(atoms.log10, ATOMS_LOG10_BUCKET),
    overridesSignature(overrides),
    roundTo(targetLn.log10, TARGET_LOG10_BUCKET),
  ].join(",");
  if (!ctx.integralCache) ctx.integralCache = new Map();
  let entry = ctx.integralCache.get(key);
  if (entry === undefined) {
    const projector = new CompoundGrowthProjector({
      baseM: 10, // unused by growthIntegralK
      staticFactors: ctx.staticFactors,
      removedPenalties: ctx.removedPenalties,
      penaltyOverrides: overrides,
      currentAtoms: atoms,
      localSpeed: 1,
    });
    entry = projector.growthIntegralK(targetLn);
    ctx.integralCache.set(key, entry);
  }
  return entry;
}

// Project time to grow currentAtoms → target at baseM. Uses mult-free integral
// K so changing mult is O(1) after the first K compute for that path.
export function project(ctx, baseM, currentAtoms, overrides, target) {
  const entry = growthIntegral(ctx, currentAtoms, overrides, target);
  if (!entry.reachable) {
    return { reachable: false, totalRealSeconds: null, finalAtoms: currentAtoms };
  }
  const totalRealSeconds = realSecondsFromIntegral(entry.K, baseM, ctx.localSpeed);
  if (totalRealSeconds === null) {
    return { reachable: false, totalRealSeconds: null, finalAtoms: currentAtoms };
  }
  return { reachable: true, totalRealSeconds, finalAtoms: entry.finalAtoms };
}

// Which tarot-style mult bonuses are unlocked at `mult`, as a stable string --
// part of the grind-to-goal cache key so two grinds on opposite sides of a
// bonus threshold never collide (improvement B, tarot interaction).
export function activeBonusKey(mult, ctx) {
  return ctx.multBonuses.map(([threshold], i) => (mult >= threshold ? i : "")).filter((s) => s !== "").join(".");
}

// A binary min-heap of [g, counter, state, path] entries, ordered by g then
// counter (insertion order) -- mirrors Python's heapq tuple ordering.
export class MinHeap {
  constructor() { this.data = []; }
  get size() { return this.data.length; }
  push(item) {
    this.data.push(item);
    let i = this.data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(i, parent)) { this._swap(i, parent); i = parent; } else break;
    }
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let smallest = i, l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && this._less(l, smallest)) smallest = l;
        if (r < n && this._less(r, smallest)) smallest = r;
        if (smallest === i) break;
        this._swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
  _less(i, j) {
    const a = this.data[i], b = this.data[j];
    return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  }
  _swap(i, j) { const t = this.data[i]; this.data[i] = this.data[j]; this.data[j] = t; }
}

export function grind(state, ctx) {
  const result = project(ctx, state.mult, state.atoms, ctx.baseOverrides, DEFAULT_SINGULARITY_REQUIREMENT);
  if (!result.reachable) return null;
  const tm = totalMult(ctx.totalMultBase, state.n1Level, state.n1Ascension, state.mult, ctx.multBonuses, ctx.stn8);
  const newMult = multAfterSingularize(tm, state.mult, ctx.stn61, ctx.shopMultGainBonus);
  return [result.totalRealSeconds, { ...state, mult: newMult, atoms: ctx.baselineAtoms }];
}

export function grindToGoal(state, ctx, goal, maxSingularizations = 200_000) {
  let total = 0;
  let s = state;
  for (let i = 0; i < maxSingularizations; i++) {
    if (s.mult >= goal) return [total, s];
    const r = grind(s, ctx);
    if (r === null) return null;
    total += r[0];
    s = r[1];
  }
  return s.mult >= goal ? [total, s] : null;
}

// Reaching one or more large atom targets in sequence (e.g. the growing
// requirements of the next Singularity counts) instead of a goal mult: a
// long grind to 10^exponent, which itself Singularizes (mult gain, atoms
// reset) same as a plain Sing. Push speed depends on the mult and the
// STN 3.1/3.2 weakening (via penaltyOverridesFor) at the time of the push.
export function finalPushTo(state, ctx, exponent) {
  if (exponent === null || exponent === undefined) return null;
  const result = project(ctx, state.mult, state.atoms, penaltyOverridesFor(state, ctx), `e${exponent}`);
  if (!result.reachable) return null;
  const tm = totalMult(ctx.totalMultBase, state.n1Level, state.n1Ascension, state.mult, ctx.multBonuses, ctx.stn8);
  const newMult = multAfterSingularize(tm, state.mult, ctx.stn61, ctx.shopMultGainBonus);
  return [result.totalRealSeconds, { ...state, mult: newMult, atoms: ctx.baselineAtoms }];
}

// Path step for a collapsed grind/push shortcut. Optional sings/pushDt let
// expandPushPath rebuild atomic rows without re-running the scan.
export function grindToGoalStep(dt, endState, meta) {
  if (meta && meta.sings != null) {
    return ["grind_to_goal", dt, endState, meta.sings, meta.pushDt];
  }
  return ["grind_to_goal", dt, endState];
}

// Mult sequence after plain sings depends only on node1 + start mult (+ bonuses),
// NOT on 3.1/3.2. Cache trajectories so every (3.1,3.2) combo reuses the same
// O(k) walk — critical when k_opt is 1e5+ (deep eN pushes).
function trajectoryKey(state, ctx) {
  return [
    state.n1Level, state.n1Ascension,
    roundTo(state.mult, MULT_BUCKET),
    roundTo(state.atoms.log10, ATOMS_LOG10_BUCKET),
    activeBonusKey(state.mult, ctx),
  ].join(",");
}

export function getSingTrajectory(ctx, state, needLen, maxSings) {
  if (!ctx.singTrajCache) ctx.singTrajCache = new Map();
  const key = trajectoryKey(state, ctx);
  let traj = ctx.singTrajCache.get(key);
  if (!traj) {
    const atomsAreBase = state.atoms.log10 === ctx.baselineAtoms.log10;
    const grindK0 = growthIntegral(ctx, state.atoms, ctx.baseOverrides, DEFAULT_SINGULARITY_REQUIREMENT);
    const grindKBase = atomsAreBase
      ? grindK0
      : growthIntegral(ctx, ctx.baselineAtoms, ctx.baseOverrides, DEFAULT_SINGULARITY_REQUIREMENT);
    const tmFixed = ctx.multBonuses.length === 0
      ? totalMult(ctx.totalMultBase, state.n1Level, state.n1Ascension, null, [], ctx.stn8)
      : null;
    // m' = m + c * m^(-alpha); precompute when TM is fixed (common case).
    const alpha = 1 / (2 * ctx.stn61);
    const cGain = tmFixed !== null ? (tmFixed - 1) * ctx.shopMultGainBonus : null;
    const cap0 = 1024;
    traj = {
      // Typed arrays: multAfter[k] / singCost[k] after k sings (profile: ~15% vs push).
      multAfter: new Float64Array(cap0),
      singCost: new Float64Array(cap0),
      cap: cap0,
      len: 0,
      grindK0,
      grindKBase,
      atomsAreBase,
      n1Level: state.n1Level,
      n1Ascension: state.n1Ascension,
      tmFixed,
      alpha,
      cGain,
      // gdt = (K/localSpeed) / log10(m) = scale / ln(m); scale = K/ls * ln(10)
      grindScale0: grindK0.reachable ? (grindK0.K / ctx.localSpeed) * Math.LN10 : null,
      grindScaleBase: grindKBase.reachable ? (grindKBase.K / ctx.localSpeed) * Math.LN10 : null,
    };
    traj.multAfter[0] = state.mult;
    traj.singCost[0] = 0;
    ctx.singTrajCache.set(key, traj);
  }

  const ensureCap = (need) => {
    if (need < traj.cap) return;
    let cap = traj.cap;
    while (cap <= need) cap *= 2;
    const multAfter = new Float64Array(cap);
    const singCost = new Float64Array(cap);
    multAfter.set(traj.multAfter.subarray(0, traj.len + 1));
    singCost.set(traj.singCost.subarray(0, traj.len + 1));
    traj.multAfter = multAfter;
    traj.singCost = singCost;
    traj.cap = cap;
  };

  const target = Math.min(needLen, maxSings);
  ensureCap(target);
  const { alpha, cGain, tmFixed } = traj;
  const invAlphaPow = cGain !== null; // hot path flag

  while (traj.len < target) {
    const k = traj.len + 1;
    const mult = traj.multAfter[k - 1];
    const scale = (k === 1 && !traj.atomsAreBase) ? traj.grindScale0 : traj.grindScaleBase;
    if (scale === null || !(mult > 1)) break;
    const gdt = scale / Math.log(mult);
    if (!(gdt >= 0)) break;
    traj.singCost[k] = traj.singCost[k - 1] + gdt;
    // Inline Singularize when TM fixed; else full totalMult path.
    if (invAlphaPow) {
      traj.multAfter[k] = mult + cGain * Math.pow(mult, -alpha);
    } else {
      const tm = totalMult(ctx.totalMultBase, traj.n1Level, traj.n1Ascension, mult, ctx.multBonuses, ctx.stn8);
      traj.multAfter[k] = multAfterSingularize(tm, mult, ctx.stn61, ctx.shopMultGainBonus);
    }
    traj.len = k;
  }
  return traj;
}

export function penaltyOverridesFor(state, ctx) {
  if (!ctx.penaltyOverrideCache) ctx.penaltyOverrideCache = new Map();
  const key = state.s31Level + "," + state.s31Ascension + "," + state.s32Level + "," + state.s32Ascension;
  let o = ctx.penaltyOverrideCache.get(key);
  if (!o) {
    o = {
      ...ctx.baseOverrides,
      [E308_PENALTY_NAME]: weakenedPenaltyExponent(baseExponent(E308_PENALTY_NAME), "3.1", state.s31Level, state.s31Ascension, ctx.stn8),
      [E500_PENALTY_NAME]: weakenedPenaltyExponent(baseExponent(E500_PENALTY_NAME), "3.2", state.s32Level, state.s32Ascension, ctx.stn8),
    };
    ctx.penaltyOverrideCache.set(key, o);
  }
  return o;
}

// Buy `stnId`'s next level. Auto-ascends (reset to level 1, ascension + 1)
// immediately and for free if this purchase brings it to level 10.
export function upgrade(stnId, state, ctx) {
  const [levelField, ascField] = NODE_FIELDS[stnId];
  const level = state[levelField], ascension = state[ascField];
  const cost = nextUpgradeCost(stnId, level, ascension);

  let atoms = state.atoms;
  let timeSeconds = 0;
  if (atoms.lt(cost)) {
    const result = project(ctx, state.mult, atoms, penaltyOverridesFor(state, ctx), cost);
    if (!result.reachable) return null;
    timeSeconds = result.totalRealSeconds;
    atoms = result.finalAtoms;
  }

  const newAtoms = spend(atoms, cost);
  let newLevel = level + 1, newAscension = ascension;
  if (newLevel >= 10) { newLevel = 1; newAscension = ascension + 1; }
  return [timeSeconds, { ...state, [levelField]: newLevel, [ascField]: newAscension, atoms: newAtoms }];
}

// Buy the next level of a non-standard node (2.0, 4.1, 4.2, 5.1, 5.2, 6.1,
// 6.2, 7.1, 7.2, 8.0 -- no modeled effect on growth, see NOTES/gaps.md) inside
// a replayable scenario. Tracked as one extra pair of state fields
// (targetLevel/targetAscension) rather than a full NODE_FIELDS entry, since a
// scenario only ever rushes one such node at a time (ctx.rushTarget names
// which one, set by makeScenario when "Rush a tree node" targets a
// non-standard node). Mirrors upgrade() exactly, honoring the optional
// cost-override log10 the player entered for that node (tree.js).
export function upgradeGeneric(stnId, state, ctx) {
  const level = state.targetLevel, ascension = state.targetAscension;
  const overrideLog10 = ctx.rushTarget && ctx.rushTarget.stnId === stnId ? ctx.rushTarget.costOverrideLog10 : null;
  const cost = nextUpgradeCost(stnId, level, ascension, overrideLog10);

  let atoms = state.atoms;
  let timeSeconds = 0;
  if (atoms.lt(cost)) {
    const result = project(ctx, state.mult, atoms, penaltyOverridesFor(state, ctx), cost);
    if (!result.reachable) return null;
    timeSeconds = result.totalRealSeconds;
    atoms = result.finalAtoms;
  }

  const newAtoms = spend(atoms, cost);
  let newLevel = level + 1, newAscension = ascension;
  if (newLevel >= 10) { newLevel = 1; newAscension = ascension + 1; }
  return [timeSeconds, { ...state, targetLevel: newLevel, targetAscension: newAscension, atoms: newAtoms }];
}

function nextPurchaseCost(stnId, state) {
  const [levelField, ascField] = NODE_FIELDS[stnId];
  return nextUpgradeCost(stnId, state[levelField], state[ascField]);
}

function stn32UpgradeAllowed(state) {
  return nextPurchaseCost("1.0", state).gt(STN32_GATE_THRESHOLD) || nextPurchaseCost("3.1", state).gt(STN32_GATE_THRESHOLD);
}

export function upgradeChoices(state, opts = null) {
  // Deep push: prefer 3.1/3.2 (push K) and cap node1 buys — each new n1 forces
  // a fresh 1e5-scale mult trajectory (see bench/push-profile.mjs).
  if (opts && opts.deepPush) {
    const choices = [];
    if (stn32UpgradeAllowed(state)) choices.push("3.2");
    choices.push("3.1");
    const n1Buys = (state.n1Ascension * 9 + state.n1Level) - (opts.n1StartScore || 0);
    if (n1Buys < (opts.maxN1Buys ?? 4)) choices.push("1.0");
    return choices;
  }
  const choices = ["1.0", "3.1"];
  if (stn32UpgradeAllowed(state)) choices.push("3.2");
  return choices;
}

export function n1Score(state) {
  return state.n1Ascension * 9 + state.n1Level;
}

export function visitedKey(state) {
  return [
    state.n1Level, state.n1Ascension, state.s31Level, state.s31Ascension,
    state.s32Level, state.s32Ascension, Math.round(state.atoms.log10 * 1000) / 1000,
  ].join(",");
}

export function searchUpgradePrefix(start, ctx, goal, maxIterations, cachedGrindToGoal, choiceOpts = null) {
  if (start.mult >= goal) return { totalRealSeconds: 0, path: [], finalState: start };

  let counter = 0;
  const heap = new MinHeap();
  heap.push([0, counter++, start, []]);
  const visited = new Map();
  let bestTotal = Infinity, bestPath = [], bestState = start;

  let iterations = 0;
  while (heap.size > 0 && iterations < maxIterations) {
    iterations++;
    const [g, , state, path] = heap.pop();
    if (g >= bestTotal) break;

    const key = visitedKey(state);
    if (visited.has(key) && visited.get(key) <= g) continue;
    visited.set(key, g);

    const shortcut = cachedGrindToGoal(state);
    if (shortcut) {
      const [shortcutDt, shortcutState, meta] = shortcut;
      const total = g + shortcutDt;
      if (total < bestTotal) {
        bestTotal = total;
        bestPath = [...path, grindToGoalStep(shortcutDt, shortcutState, meta)];
        bestState = shortcutState;
      }
    }

    for (const stnId of upgradeChoices(state, choiceOpts)) {
      const result = upgrade(stnId, state, ctx);
      if (!result) continue;
      const [dt, newState] = result;
      const newG = g + dt;
      if (newG >= bestTotal) continue;
      const newKey = visitedKey(newState);
      if (visited.has(newKey) && visited.get(newKey) <= newG) continue;
      heap.push([newG, counter++, newState, [...path, [`upgrade_${stnId}`, dt, newState]]]);
    }
  }

  return { totalRealSeconds: bestTotal, path: bestPath, finalState: bestState };
}

// Apply n plain Singularizes using the shared trajectory (batch; O(n) once).
export function applyGrinds(state, ctx, n) {
  if (n <= 0) return [0, state];
  const traj = getSingTrajectory(ctx, state, n, Math.max(n, PUSH_MAX_SINGS));
  if (traj.len < n) return null;
  return [traj.singCost[n], {
    ...state,
    mult: traj.multAfter[n],
    atoms: ctx.baselineAtoms,
  }];
}

/** Parse grind_xN → N, or 1 for plain "grind", else 0. */
export function grindRepeatCount(action) {
  if (action === "grind") return 1;
  if (typeof action === "string" && action.startsWith("grind_x")) {
    const n = parseInt(action.slice(7), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function stepAction(action, state, ctx, pushIdxRef) {
  const grindN = grindRepeatCount(action);
  if (grindN > 0) {
    if (grindN === 1 && action === "grind") return grind(state, ctx);
    return applyGrinds(state, ctx, grindN);
  }
  if (action === "final_push") {
    const exp = (ctx.pushExponents ?? [])[pushIdxRef.i++];
    return finalPushTo(state, ctx, exp);
  }
  if (action.startsWith("upgrade_")) {
    const stnId = action.slice("upgrade_".length);
    return isStandardNode(stnId) ? upgrade(stnId, state, ctx) : upgradeGeneric(stnId, state, ctx);
  }
  return null;
}

export function replaySteps(actions, state, ctx) {
  let total = 0;
  const steps = [];
  const pushIdxRef = { i: 0 };
  for (const action of actions) {
    const result = stepAction(action, state, ctx, pushIdxRef);
    if (!result) return null;
    const [dt, newState] = result;
    total += dt;
    steps.push([action, dt, newState]);
    state = newState;
  }
  return [total, state, steps];
}

// Like replaySteps, but doesn't discard partial progress on failure -- used
// to replay a user-edited (possibly invalid) scenario for display.
export function replayActionsPartial(actions, state, ctx) {
  let total = 0;
  const steps = [];
  let failedAt = null;
  const pushIdxRef = { i: 0 };
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = stepAction(action, state, ctx, pushIdxRef);
    if (!result) { failedAt = i; break; }
    const [dt, newState] = result;
    total += dt;
    steps.push({ action, dt, state: newState });
    state = newState;
  }
  return { steps, finalState: state, totalTime: total, failedAt };
}

// Action names worth *inserting* at a position (improvement A's insert move):
// grind, 3.1, and 3.2 once its e500 gate is open. Node1 is deliberately never
// inserted -- Phase 1 owns node1 count/order; the swap move is what lets a grind
// cross an existing node1 upgrade (the Sing<->STN-1.0 reorder that motivated this).
function insertLabels(state, ctx) {
  const labels = ["grind", "upgrade_3.1"];
  if (stn32UpgradeAllowed(state)) labels.push("upgrade_3.2");
  return labels;
}

// Full cost of an action prefix + grind_to_goal from `start`: [total, path] or
// null if infeasible. Replays the whole prefix; the projection cache (improvement
// C) makes the shared leading steps of sibling neighbours near-free.
export function evaluateSequence(actions, start, ctx, cachedGrindToGoal) {
  const replay = replaySteps(actions, start, ctx);
  if (!replay) return null;
  const [prefixTime, endState, steps] = replay;
  const shortcut = cachedGrindToGoal(endState);
  if (!shortcut) return null;
  const [sdt, sstate, meta] = shortcut;
  return [prefixTime + sdt, [...steps, grindToGoalStep(sdt, sstate, meta)]];
}

// Every action prefix one local move away from `actions` (improvement A): an
// insert (grind/3.1/3.2 at any position), an adjacent swap of two unlike steps,
// or a removal. Deduplicated. The base sequence is replayed once to know the
// state before each position so inserts gate 3.2 correctly and positions past an
// infeasible step are skipped.
function neighborSequences(actions, start, ctx) {
  const states = [start];
  let state = start;
  for (const action of actions) {
    const result = action === "grind" ? grind(state, ctx) : upgrade(action.slice("upgrade_".length), state, ctx);
    if (!result) break;
    state = result[1];
    states.push(state);
  }

  const n = actions.length;
  const seen = new Set();
  const out = [];
  const add = (seq) => {
    const key = seq.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(seq); }
  };

  for (let i = 0; i < states.length; i++) {
    for (const label of insertLabels(states[i], ctx)) {
      add([...actions.slice(0, i), label, ...actions.slice(i)]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (actions[i] !== actions[i + 1]) {
      add([...actions.slice(0, i), actions[i + 1], actions[i], ...actions.slice(i + 2)]);
    }
  }
  for (let i = 0; i < n; i++) {
    add([...actions.slice(0, i), ...actions.slice(i + 1)]);
  }
  return out;
}

// Phase 2: beam search (improvements A + F) over action prefixes. Each round,
// every beam sequence spawns its neighborSequences (insert/swap/remove), each
// re-costed by evaluateSequence; the best `beamWidth` distinct results become
// the next beam. A beam (rather than a single incumbent) plus up to `patience`
// non-improving rounds lets the search take a locally-worse step to cross a
// barrier -- while the global best seen is always what's returned. The swap move
// expresses the Sing<->STN-1.0 reorder a plain insert cannot; remove walks back
// a node1 upgrade Phase 1 committed to.
export function tryInsertImprovements(
  start, ctx, goal, path, totalTime, cachedGrindToGoal,
  minRelativeGain = 1e-9, maxRounds = 1000, beamWidth = 4, patience = 2,
) {
  const actionsOf = (p) => p.filter((s) => s[0] !== "grind_to_goal").map((s) => s[0]);

  let bestTotal = totalTime, bestPath = path;
  let beam = [[totalTime, actionsOf(path), path]];
  const seen = new Set([beam[0][1].join(",")]);
  let roundsSinceImprove = 0;

  for (let round = 0; round < maxRounds; round++) {
    const candidates = [];
    for (const [, curActions] of beam) {
      for (const seq of neighborSequences(curActions, start, ctx)) {
        const key = seq.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const evaluated = evaluateSequence(seq, start, ctx, cachedGrindToGoal);
        if (!evaluated) continue;
        candidates.push([evaluated[0], seq, evaluated[1]]);
      }
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a[0] - b[0]);
    beam = candidates.slice(0, beamWidth);

    if (beam[0][0] < bestTotal * (1 - minRelativeGain)) {
      bestTotal = beam[0][0];
      bestPath = beam[0][2];
      roundsSinceImprove = 0;
    } else {
      roundsSinceImprove += 1;
      if (roundsSinceImprove > patience) break;
    }
  }

  return [bestTotal, bestPath];
}
