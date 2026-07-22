// Total Mult and Singularize: converting Total Mult into a permanent
// increase to current Singularity Mult, plus STN per-level/per-ascension effects.
// Direct port of singularity_sim/singularize.py.

// (a, p, b) per STN id, in effect = 1 + a * ascension**p + b * level / (ascension + 1)
export const NODE_EFFECT_PARAMS = {
  "1.0": [0.10, 0.60, 0.010],
  "2.0": [0.01, 0.70, 0.001],
  "3.1": [0.10, 0.60, 0.010],
  "3.2": [0.10, 0.70, 0.010],
  "4.1": [0.01, 0.80, 0.001],
  "4.2": [2.50, 0.75, 0.250],
  "5.1": [0.10, 0.64, 0.010],
  "5.2": [0.30, 0.666, 0.030],
  "6.1": [0.50, 0.60, 0.050],
  "6.2": [0.20, 0.65, 0.020],
  "7.1": [0.06, 0.60, 0.006],
  "7.2": [0.06, 0.60, 0.006],
  "8.0": [0.01, 0.60, 0.001],
};

export function nodeEffect(stnId, level, ascension) {
  if (level < 0) throw new Error(`level must be non-negative, got ${level}`);
  if (ascension < 0) throw new Error(`ascension must be non-negative, got ${ascension}`);
  const [a, p, b] = NODE_EFFECT_PARAMS[stnId];
  return 1 + a * Math.pow(ascension, p) + (b * level) / (ascension + 1);
}

// STN 8.0 ("STN 1 to 7.2 Effect *x") is a capstone that multiplies every other
// node's effectiveness. Per the model: if a node's effect is f(x), then with
// STN 8 it becomes f(x) * stn8. Returns f(x) * stn8; stn8 defaults to 1 (no
// STN 8), leaving the bare node effect unchanged.
export function effectiveNodeEffect(stnId, level, ascension, stn8 = 1) {
  return nodeEffect(stnId, level, ascension) * stn8;
}

// The STN 8 multiplier itself (its own node effect), applied to all other nodes.
export function stn8Multiplier(level, ascension) {
  return nodeEffect("8.0", level, ascension);
}

// Total Mult, times every tarot-style bonus already unlocked. `multBonuses`
// are [multThreshold, bonus] pairs (e.g. a challenge completable at x36 mult
// that grants more Total Mult): each one whose threshold <= currentMult
// multiplies the result. Passing currentMult = null (the default) skips them,
// keeping the pre-tarot behavior for callers that don't model them.
export function totalMult(totalMultBase, node1Level, node1Ascension = 0, currentMult = null, multBonuses = [], stn8 = 1) {
  let tm = totalMultBase * effectiveNodeEffect("1.0", node1Level, node1Ascension, stn8);
  if (currentMult !== null) {
    for (const [threshold, bonus] of multBonuses) {
      if (currentMult >= threshold) tm *= bonus;
    }
  }
  return tm;
}

// STN 6.1 ("Next Singularity Mult Decay /x") weakens the current-mult decay in
// each Singularize's mult gain by dividing the decay exponent: the base gain is
// (Total Mult - 1) / current_mult^(1/2), and STN 6.1 turns the exponent into
// 1/(2 * stn61), giving gain = (Total Mult - 1) / current_mult^(1/(2*stn61)),
// where stn61 is STN 6.1's effect. stn61 defaults to 1 (no STN 6.1), which
// reduces to the original 1/2 exponent.
//
// shopMultGainBonus is the "Singularity Mult Gain" shop stat's flat multiplier
// on top of that (1 + shopLevel * 2.5%, level 0-10) -- defaults to 1 (unbought).
export function multGainFromSingularize(totalMultValue, currentMult, stn61 = 1, shopMultGainBonus = 1) {
  if (currentMult <= 0) throw new Error(`current_mult must be positive, got ${currentMult}`);
  return ((totalMultValue - 1) / Math.pow(currentMult, 1 / (2 * stn61))) * shopMultGainBonus;
}

export function multAfterSingularize(totalMultValue, currentMult, stn61 = 1, shopMultGainBonus = 1) {
  return currentMult + multGainFromSingularize(totalMultValue, currentMult, stn61, shopMultGainBonus);
}

// STN 3.1/3.2/6.2-style "/x" weakening: 1 / (1 + k/x), k chosen so an
// unleveled node (x=1) reproduces the penalty's own base exponent exactly.
export function weakenedPenaltyExponent(baseExp, stnId, level, ascension = 0, stn8 = 1) {
  const x = effectiveNodeEffect(stnId, level, ascension, stn8);
  const k = (1 - baseExp) / baseExp;
  return 1 / (1 + k / x);
}
