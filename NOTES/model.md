# Model as implemented

The math the planner actually runs, file by file. Cross-checked against the
community spreadsheet in [community-spreadsheet.md](community-spreadsheet.md)
and against in-game screenshots — see the validation log there.

## Atom growth
- Per-application atom gain: `g = m ^ (1.02 * p)` where `m` = current
  Singularity Mult, `p` = product of all active penalty/buff exponents
  (`formula.js`).
- Growth of log10(atoms) per game-second: `1.02 * p * log10(m)` (`growth.js`).
- Real time = game time / Local Speed.
- Local Speed = `TarotLocalSpeed ^ (0.05 + 0.02 * RN136 level) * (1 + 0.02 * shopLocalSpeedLevel)`
  (`app.js readStatsForm`). The `0.02 * RN136` exponent term was added
  2026-07-20 from the community spreadsheet; defaults to RN136 level 0
  (exponent 0.05, matching the original pre-RN136 behavior).

## Atom thresholds (buffs/penalties on Atom Gain) — `atomPenalties.js`
| Threshold | Exponent | Removed/weakened by |
|---|---|---|
| 1e6 | ×1.0 buff slot (Relic 69 bonus applies here) | — |
| 1e10 | ^0.5 base | RN128 level 0-10: `exponent = 0.5 + 0.05×level` (full removal at level 10) |
| 1e50 | ^(5/6) base | RN126 level 0-10: `exponent = 1 − (1−level)/6` (full removal at level 1+) |
| 1e154 | ^0.8475 base | RN127 level 0-10: `exponent = 1 − 0.153×(1−level)` (full removal at level 1+) |
| 1.6e256 | ^(5/7) | — |
| 1.798e308 | ^0.125 base | STN 3.1: `exp' = 1/(1 + k/effect)`, k=(1-0.125)/0.125=7 |
| 1e500 | ^0.05 base | STN 3.2: k=(1-0.05)/0.05=19 |
| 1e1000 | ^0.033 base | STN 6.2: k=(1-0.033)/0.033≈29 |
| 1e2000 | ^0.5 | none known — VERIFY IN GAME |
| 1e3000 | ^(1/3) | none known — VERIFY IN GAME |
| 1e5000 | ^0.2 | none known — VERIFY IN GAME |
| 1e10000 | ^0.1 | none known — VERIFY IN GAME |

All four RN126/127/128/131 formulas were corrected 2026-07-20 from
"owned/not-owned toggle" to "leveled 0-10" — see
[community-spreadsheet.md](community-spreadsheet.md) for the source and
[gaps.md](gaps.md) for what's still unverified.

- RN131: Atom Gain buff `factor = 1 + 0.005 × SingularityCount × RN131_level`
  (level 1 reduces to the old `1 + count/200` special case). **Real max level
  is 1, NOT 10** (unlike RN126/127/128/136) -- confirmed 2026-07-21 against
  three independent community-spreadsheet exports, all showing level 1 as
  maxed. The site's "maxed" checkbox previously mapped to 10 for all five RN
  fields uniformly (a copy-paste assumption from RN126/127/128's real 0-10
  scale, never verified for RN131 specifically) -- inflated this buff ~3.3x
  for anyone at the real max, which was the entire cause of a user-reported
  push-time prediction (1h51m) coming in ~4x faster than their actual in-game
  time (7h+). Fixed in `app.js readRnLevel`'s `maxLevel` parameter.
- RN136: Local Speed exponent bonus, folded into the Local Speed formula above
  (not an atom-gain p-chain factor).
- Relic 69: buff factor; level→buff formula in code is `1 + 0.0066 * level`,
  confirmed against a live game screenshot at level 149 (see gaps.md's
  validation log) — no longer flagged suspect, but "buff" mode (enter the
  number directly) is still the safer default if you can read it off the
  Relics page.

## Singularity Tree — `singularize.js`, `tree.js`

### Layout (from the in-game tree screenshot, 2026-07-20)
The tree is a single linear chain from node 1 to node 8, with three tiers
(3, 4, 5, 6, 7) split into two parallel branches (`.1`/`.2`) that both feed
into node 8 at the top:

```
1 — 2 — {3.1, 3.2} — {4.1, 4.2} — {5.1, 5.2} — {6.1, 6.2} — {7.1, 7.2} — 8
```

All 13 nodes have known effect params (below) — only their upgrade *costs*
are partly unknown, see [gaps.md](gaps.md) #7.

- Node effect: `1 + a * ascension^p + b * level / (ascension + 1)`, then × STN 8
  effect. Params (a, p, b): 1.0=(0.10,0.60,0.010), 2.0=(0.01,0.70,0.001),
  3.1=(0.10,0.60,0.010), 3.2=(0.10,0.70,0.010), 4.1=(0.01,0.80,0.001),
  4.2=(2.50,0.75,0.250), 5.1=(0.10,0.64,0.010), 5.2=(0.30,0.666,0.030),
  6.1=(0.50,0.60,0.050), 6.2=(0.20,0.65,0.020), 7.1=(0.06,0.60,0.006),
  7.2=(0.06,0.60,0.006), 8.0=(0.01,0.60,0.001). 1.0/3.1/3.2/6.1/6.2/7.1/8.0
  confirmed identical in the community spreadsheet (7.1 present in their
  sheet too — see [community-spreadsheet.md](community-spreadsheet.md));
  2.0/4.1/4.2/5.1/5.2/7.2 are NOT in the spreadsheet and come from
  `singularity_sim` only — treat those six as lower-confidence than the rest
  until cross-checked.
- Penalty weakening by a node: `exp' = 1 / (1 + k / effect)`,
  `k = (1 - baseExp) / baseExp`. Only STN 3.1/3.2/6.2 are known to weaken a
  specific atom penalty (see the threshold table above); whether any of
  4.1/4.2/5.1/5.2/7.1/7.2 weakens the e2000+ penalties is gaps.md #6.

### Upgrade costs — `tree.js`
cost(level→level+1) = baseCost × (e5 × e5^ascension)^level; level 10
auto-ascends (level→1, ascension+1, free). **Only 3 of 13 base costs are
confirmed**: STN 1.0 = e300, STN 3.1 = e420, STN 3.2 = e420
(`STN_DEFINITIONS[id].confirmed === true`). The other 10 (2.0, 4.1, 4.2, 5.1,
5.2, 6.1, 6.2, 7.1, 7.2, 8.0) default to an explicitly-labeled
estimated/unconfirmed cost table (linear per tier, fit through the 3 known
points — see [gaps.md](gaps.md) #7 for the derivation and its dead ends:
community spreadsheet, wiki).

The general optimizer/push planner still only ever buy 1.0/3.1/3.2
mid-path — the other 10 stay fixed config there. The **node-rush planner**
(`nodeRush.js`, [architecture.md](architecture.md)) is the one place all 13
are purchasable: for a non-standard target it tracks the node's own
level/ascension as a local `targetLevel`/`targetAscension` state field
(never touching searchCore.js's shared 3-node `NODE_FIELDS`, so the other
planners' branching factor is unaffected) and calls `nextUpgradeCost` with
an optional 4th argument, `baseCostOverrideLog10` — a plain log10 number
(not a `LogNum`, so it survives the worker postMessage boundary) that
replaces the estimated `baseAtomCost` for that call. The UI's "Rush a tree
node" panel back-solves this override from a "cost shown in-game now" field
via `tree.js backsolveBaseCostLog10(stnId, level, ascension, shownCostLog10)`
— same backsolve pattern `app.js` already uses for `totalMultBase` from the
shown Total Mult. Leaving that field blank uses the estimate untouched.

## Singularize (one "Sing")
- Requirement: 1e308 atoms (`growth.js DEFAULT_SINGULARITY_REQUIREMENT`).
  The wiki confirms you can *always* still Singularize at ~1.8e308 even after
  the count requirement starts growing (see [wiki-tables.md](wiki-tables.md),
  Event Horizon Tax).
- Mult gain: `(TotalMult − 1) / mult^(1 / (2 × stn61)) × (1 + 0.025 × shopMultGainLevel)`.
- Total Mult = totalMultBase × STN 1.0 effect × unlocked tarot-style bonuses.
- **Known gap**: past e308 atoms, "Atoms" itself becomes an additional
  Singularity Mult Factor (Atom Overflow milestone) — not modeled. See
  [gaps.md](gaps.md) #4.
