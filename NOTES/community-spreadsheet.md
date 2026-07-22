# Community spreadsheet cross-check

Source: user-supplied `Копия Singularity Time Spender - V1.1.xlsx`, two
sheets ("Time optimizer", "Sheet1"), read 2026-07-20 via openpyxl (formulas +
cached values). A community-built calculator, independently reverse-engineered
against the live game — useful as a second source to validate/correct our
model, not as ground truth on its own (it also has open questions, e.g. the
"Atoms" Total Mult factor defaults to 1/"optimal" rather than a known formula).

## What matched our model exactly
- Tree node effect formula and (a, p, b) parameters for 1.0, 3.1, 3.2, 6.1,
  6.2, 8 — byte-for-byte identical to `singularize.js NODE_EFFECT_PARAMS`.
- Penalty-weakening formula `1/(1+k/effect)`, with the same k values for
  e308 (k=7), e500 (k=19), e1000 (k=29).
- Flat penalty exponents for e2000 (0.5), e3000 (1/3), e5000 (0.2), e10000
  (0.1) — confirmed these have NO tree-node weakening term in the
  spreadsheet either (matches our `atomPenalties.js`).
- The `^1.02` global exponent — the spreadsheet has it as a fixed constant
  too (their "Vessel"-style factor list), consistent with our finding that
  it's the "Viral Ascension" milestone reward, not a base-game constant.

## What corrected our model (applied 2026-07-20)
- **RN126/127/128/131 are leveled 0-10 Refine Nodes, not owned/not-owned
  toggles.** The spreadsheet's Sheet1 config block has them as level inputs
  (e.g. "Refine Node 128 level" = 10) feeding these formulas:
  - RN126 (e50 penalty): `exponent = 1 − (1−level)/6`
  - RN127 (e154 penalty): `exponent = 1 − 0.153×(1−level)`
  - RN128 (e10 penalty): `exponent = 0.5 + 0.05×level`
  - RN131 (Atom Gain buff): `factor = 1 + 0.005 × SingularityCount × level`
  All four reduce to our old "removed" boolean at level 1 (RN126/127) or
  level 10 (RN128), and to the old hardcoded RN131 formula at level 1 — so
  the correction is backward-compatible with anyone who had them fully
  maxed, but matters a lot for a node partially leveled (e.g. RN128 at
  level 1-9 was being modeled as either 0% or 100% removed, when the true
  value is somewhere between 0.55 and 0.95).
- **RN136 exists** ("Refine Node 136 level") and adds to the Local Speed
  exponent: `LocalSpeed = TarotLocalSpeed ^ (0.05 + 0.02×level) × shopBonus`.
  Not in our model before 2026-07-20; added as an optional field defaulting
  to level 0 (no behavior change for anyone who doesn't set it).

## Still open / not yet applied
- **STN 8 may multiply Local Speed as a whole**, not just node effects. The
  spreadsheet's Local Speed cell (`T27` / `D23`) is
  `(TarotSpeed^(0.05+0.02·RN136)) × (1+shopBonus) × STN8_effect` — i.e. STN 8
  appears as a third multiplicative term on Local Speed itself, on top of it
  already scaling every tree node's own effect. **Not applied to our code
  yet** — needs in-game confirmation before changing `localSpeed` to depend
  on STN 8, since double-applying STN 8 (once via node effects, once via
  Local Speed) would be wrong if the spreadsheet is mis-modeling it too.
- **"Atoms" Total Mult factor** (`Sheet1!D8`, "Atoms (1 if optimal)"): the
  spreadsheet's own author defaults this to 1 (i.e. doesn't model it) — same
  gap we have, see [gaps.md](gaps.md) #4 (Atom Overflow). Their formula for
  Total Mult also includes unmodeled factors "Vessel", "Plague", "Sing Mult
  Factor", "Rf Node 125", "Singular Zodiacs" — all entered as plain
  multiplicative constants the player reads off other game tabs, not derived.
  This confirms our `totalMultBase` (backed out from the shown Total Mult)
  approach is the right shape: treat everything upstream of STN 1.0 as one
  opaque base multiplier the user supplies.
- Their sheet exposes STN **7.1** (`Sheet1!D19`/`E19`) with params matching
  `NODE_EFFECT_PARAMS["7.1"] = (0.06, 0.60, 0.006)` already in our code but
  unused by the planner (no known penalty it weakens, no cost formula) —
  low priority unless a player reports what 7.1 actually does.
- The spreadsheet's own tree-upgrade cost model is NOT present (it's a
  "type in stats, tells you push time" tool, not a path search) — so it
  offers nothing to check against our `tree.js nextUpgradeCost`. Confirmed by
  reading every formula cell 2026-07-20: the "tree node 3.1/3.2/6.2/8/7.1
  time cost" cells (`Time optimizer!D35/D62/D89/D116/D251`, each a
  `SUM(...)` over a 10-row block) sum up **seconds of grind time saved** by a
  hypothetical +1 ascend, used only to rank "what should I push" (`M5`'s
  `IFS`) — there's no atoms-spent column anywhere near them, so this can't be
  reverse-engineered into a cost formula even indirectly. See
  [gaps.md](gaps.md) #7 for where the STN cost search ended up (also checked
  the wiki full-text search — no hits) and the linear-tier cost guess.

## Not investigated
The spreadsheet's "Time optimizer" sheet duplicates most of Sheet1's config
with slightly different values (a second player's stats?) plus a
recommendation cell (`M5`) that picks the best of a handful of hardcoded
tree-node choices by comparing raw "time saved / atoms spent" ratios — a
much simpler heuristic than this planner's Dijkstra+beam search. Not worth
porting; our `rankPushTreeUpgrades` already does this more rigorously (see
[architecture.md](architecture.md)).
