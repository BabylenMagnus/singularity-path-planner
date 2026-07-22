// Micro-profile push-path hot pieces. Run: node bench/push-profile.mjs
//
// Baseline after integral+ternary+deep-push (2026-07):
//   e1020  ~20–35 ms total
//   e10000 ~200 ms search (was multi-minute / hang)
// Hot wall for deep pushes: building sing mult trajectories (~10–15 ms / 100k).
// Deep mode limits node1 branches so Dijkstra reuses one trajectory.
import { findPushPathVariants, expandPushPath, E1000_PENALTY_NAME } from "../js/pathSearch.js";
import { nodeEffect, stn8Multiplier, weakenedPenaltyExponent, multAfterSingularize, totalMult } from "../js/singularize.js";
import { baseExponent, relic69LevelBonus } from "../js/atomPenalties.js";
import {
  CompoundGrowthProjector,
  DEFAULT_SINGULARITY_REQUIREMENT,
  realSecondsFromIntegral,
} from "../js/growth.js";
import { LogNum } from "../js/bignum.js";

const treeState = {
  "1.0": [7, 6], "3.1": [8, 8], "3.2": [7, 7],
  "6.1": [1, 0], "6.2": [0, 0], "8.0": [0, 0],
};
const stn8 = stn8Multiplier(...treeState["8.0"]);
const stn61 = nodeEffect("6.1", ...treeState["6.1"]);
const totalMultBase = 2.9593 / (nodeEffect("1.0", ...treeState["1.0"]) * stn8);
const localSpeed = 41477368 ** 0.05 * (1 + 4 * 0.02);
const shopMultGainBonus = 1 + 5 * 0.025;
const staticFactors = [1 + 52 / 200];
const removedPenalties = new Set(["RN126", "RN127", "RN128"]);
const baseOverrides = {
  relic_69_bonus: relic69LevelBonus(149),
  [E1000_PENALTY_NAME]: weakenedPenaltyExponent(baseExponent(E1000_PENALTY_NAME), "6.2", 0, 0, stn8),
};
const common = {
  startingMult: 723,
  totalMultBase,
  initialTreeState: treeState,
  staticFactors: [...staticFactors],
  removedPenalties: [...removedPenalties],
  baseOverrides,
  localSpeed,
  maxIterations: 50_000,
  multBonuses: [],
  stn8,
  stn61,
  shopMultGainBonus,
};

function ms(fn, n = 1) {
  const t0 = performance.now();
  let out;
  for (let i = 0; i < n; i++) out = fn();
  return { ms: performance.now() - t0, out, per: (performance.now() - t0) / n };
}

function bench(name, fn, n = 1) {
  // warm
  fn();
  const r = ms(fn, n);
  console.log(`${name.padEnd(42)} ${(r.ms).toFixed(2).padStart(10)} ms` + (n > 1 ? `  (${n}×, ${(r.ms / n).toFixed(3)}/call)` : ""));
  return r;
}

console.log("=== micro pieces ===");
console.log(`localSpeed=${localSpeed.toFixed(4)} tmBase=${totalMultBase.toFixed(6)}`);

const projector = new CompoundGrowthProjector({
  baseM: 723, staticFactors, removedPenalties, penaltyOverrides: baseOverrides,
  currentAtoms: "1", localSpeed,
});

bench("growthIntegralK e1020", () => projector.growthIntegralK("e1020"), 200);
bench("growthIntegralK e10000", () => projector.growthIntegralK("e10000"), 200);
bench("milestonesToTarget e1020", () => projector.milestonesToTarget("e1020"), 200);
bench("milestonesToTarget e10000", () => projector.milestonesToTarget("e10000"), 200);

const tm = totalMult(totalMultBase, 7, 6, null, [], stn8);
const alpha = 1 / (2 * stn61);
const c = (tm - 1) * shopMultGainBonus;
bench("multAfter×100k (pow)", () => {
  let m = 723;
  for (let i = 0; i < 100_000; i++) m = multAfterSingularize(tm, m, stn61, shopMultGainBonus);
  return m;
}, 5);
bench("multAfter×100k (inline)", () => {
  let m = 723;
  for (let i = 0; i < 100_000; i++) m = m + c * Math.pow(m, -alpha);
  return m;
}, 5);

// Array growth strategies for 140k traj
bench("array push 140k numbers", () => {
  const a = [723];
  let m = 723;
  for (let i = 0; i < 140_000; i++) {
    m = m + c * Math.pow(m, -alpha);
    a.push(m);
  }
  return a.length;
}, 3);
bench("Float64Array 140k prealloc", () => {
  const a = new Float64Array(140_001);
  a[0] = 723;
  let m = 723;
  for (let i = 1; i <= 140_000; i++) {
    m = m + c * Math.pow(m, -alpha);
    a[i] = m;
  }
  return a[140_000];
}, 3);

console.log("\n=== end-to-end push ===");
for (const exp of [1020, 10000]) {
  const r = bench(`findPushPathVariants e${exp}`, () => findPushPathVariants({ ...common, pushExponents: [exp] }));
  if (r.out?.reachable) {
    const res = r.out;
    bench(`  expand×${res.variants.length} e${exp}`, () => {
      for (const v of res.variants) expandPushPath(v.segments, res.start, res.ctx);
    });
    for (const v of res.variants) {
      const sings = v.segments[0]?.path?.[0]?.[3] ?? "?";
      console.log(`    ${v.name}: sings=${sings}`);
    }
  }
}

// Variant isolation: sing_only-ish cost by only first shortcut
console.log("\n=== notes ===");
console.log("If multAfter×100k dominates e10000, traj build is the wall.");
console.log("If findPush >> traj, Dijkstra/phase2 dominates.");
